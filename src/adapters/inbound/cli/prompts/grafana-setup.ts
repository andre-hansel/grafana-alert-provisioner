import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { GrafanaPort, GrafanaDataSource, GrafanaContactPoint } from '../../../../ports/outbound/grafana-port.js';

export interface GrafanaSetupResult {
  grafanaUrl: string;
  dataSources: GrafanaDataSource[];
  contactPoints: readonly GrafanaContactPoint[];
  confirmed: boolean;
}

export async function runGrafanaSetupPrompt(
  grafana: GrafanaPort,
  defaultUrl: string,
  existingApiKey?: string
): Promise<GrafanaSetupResult> {
  p.intro(pc.bgGreen(pc.black(' Grafana Setup ')));

  // Check if we already have a working connection
  let connected = false;
  let allDataSources: GrafanaDataSource[] = [];
  let contactPoints: GrafanaContactPoint[] = [];
  let grafanaUrl = defaultUrl;

  if (existingApiKey) {
    const spinner = p.spinner();
    spinner.start('Testing Grafana connection...');

    const status = await grafana.testConnection();
    if (status.connected) {
      spinner.stop(`Connected to Grafana ${status.version ? `v${status.version}` : ''}`);
      connected = true;

      // Fetch data sources
      try {
        allDataSources = [...await grafana.listDataSources()];
        contactPoints = [...await grafana.listContactPoints()];
      } catch (error) {
        spinner.stop('Connected but failed to fetch data sources');
        p.log.error(pc.red(error instanceof Error ? error.message : 'Unknown error'));
      }
    } else {
      spinner.stop('Connection failed');
      p.log.warn(pc.yellow(status.error ?? 'Could not connect to Grafana'));
    }
  }

  // If not connected, prompt for credentials
  if (!connected || allDataSources.length === 0) {
    p.note(
      [
        'A Grafana API key is required to fetch available data sources.',
        'Create a Service Account with Viewer role in Grafana:',
        `  ${pc.dim('Administration → Service accounts → Add service account')}`,
        '',
        pc.dim('The API key is only used to read data sources and contact points.'),
      ].join('\n'),
      'Grafana Connection'
    );

    // Grafana URL
    const urlInput = await p.text({
      message: `Grafana URL (Enter for ${defaultUrl}):`,
      placeholder: defaultUrl,
      validate: value => {
        const url = value.trim() || defaultUrl;
        try {
          new URL(url);
          return undefined;
        } catch {
          return 'Invalid URL format';
        }
      },
    });

    if (p.isCancel(urlInput)) {
      return createEmptyResult(grafanaUrl);
    }

    grafanaUrl = urlInput.trim() || defaultUrl;

    // API Key
    const apiKey = await p.password({
      message: 'Grafana API Key (Service Account Token):',
      validate: value => {
        if (!value || value.trim().length === 0) {
          return 'API key is required';
        }
        return undefined;
      },
    });

    if (p.isCancel(apiKey)) {
      return createEmptyResult(grafanaUrl);
    }

    // Update environment and test connection
    process.env.GRAFANA_URL = grafanaUrl;
    process.env.GRAFANA_API_KEY = apiKey;

    // Create new adapter with updated credentials
    const { createGrafanaApiAdapter } = await import('../../../outbound/grafana/grafana-api-adapter.js');
    const newGrafana = createGrafanaApiAdapter({ url: grafanaUrl, apiKey });

    const spinner = p.spinner();
    spinner.start('Testing connection...');

    const status = await newGrafana.testConnection();
    if (!status.connected) {
      spinner.stop('Connection failed');
      p.log.error(pc.red(status.error ?? 'Could not connect to Grafana'));
      return createEmptyResult(grafanaUrl);
    }

    spinner.stop(`Connected to Grafana ${status.version ? `v${status.version}` : ''}`);

    // Fetch data sources
    spinner.start('Fetching data sources...');
    try {
      allDataSources = [...await newGrafana.listDataSources()];
      contactPoints = [...await newGrafana.listContactPoints()];
      spinner.stop(`Found ${allDataSources.length} data sources`);
    } catch (error) {
      spinner.stop('Failed to fetch data sources');
      p.log.error(pc.red(error instanceof Error ? error.message : 'Unknown error'));
      return createEmptyResult(grafanaUrl);
    }
  }

  if (allDataSources.length === 0) {
    p.log.error(pc.red('No data sources found in Grafana.'));
    p.note(
      [
        'Please configure data sources in Grafana first:',
        `  ${pc.dim('Connections → Data sources → Add data source')}`,
      ].join('\n'),
      'No Data Sources'
    );
    return createEmptyResult(grafanaUrl);
  }

  // Group data sources by type for display
  const byType = new Map<string, GrafanaDataSource[]>();
  for (const ds of allDataSources) {
    const type = ds.type.toLowerCase();
    const existing = byType.get(type) ?? [];
    byType.set(type, [...existing, ds]);
  }

  // Show summary of all types
  const typeSummary = Array.from(byType.entries())
    .map(([type, sources]) => `${type}: ${sources.length}`)
    .join(', ');
  p.log.info(`Found ${allDataSources.length} data sources (${typeSummary})`);

  // Select data sources - show ALL
  const selectedDataSources = await selectDataSources(allDataSources);
  if (selectedDataSources === null || selectedDataSources.length === 0) {
    p.log.error(pc.red('At least one data source must be selected.'));
    return createEmptyResult(grafanaUrl);
  }

  // Summary
  p.note(
    selectedDataSources.map(ds => `${ds.type}: ${ds.name}`).join('\n'),
    'Selected Data Sources'
  );

  const confirmed = await p.confirm({
    message: 'Proceed with these data sources?',
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    return createEmptyResult(grafanaUrl);
  }

  return {
    grafanaUrl,
    dataSources: selectedDataSources,
    contactPoints,
    confirmed: true,
  };
}

function createEmptyResult(grafanaUrl: string): GrafanaSetupResult {
  return {
    grafanaUrl,
    dataSources: [],
    contactPoints: [],
    confirmed: false,
  };
}

async function selectDataSources(
  dataSources: GrafanaDataSource[]
): Promise<GrafanaDataSource[] | null> {
  // Sort by type then name for better organization
  const sorted = [...dataSources].sort((a, b) => {
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare !== 0) return typeCompare;
    return a.name.localeCompare(b.name);
  });

  // Build options showing ALL data sources
  const options = sorted.map(ds => ({
    value: ds.uid,
    label: ds.name,
    hint: ds.type,
  }));

  // Offer filter option first if many data sources
  if (dataSources.length > 20) {
    const approach = await p.select({
      message: `${dataSources.length} data sources found. How do you want to select?`,
      options: [
        { value: 'filter', label: 'Filter by name or type', hint: 'Narrow down the list' },
        { value: 'all', label: 'Show all', hint: `Browse all ${dataSources.length}` },
      ],
    });

    if (p.isCancel(approach)) {
      return null;
    }

    if (approach === 'filter') {
      const filterText = await p.text({
        message: 'Filter data sources (matches name or type):',
        placeholder: 'e.g., cloudwatch, prod, us-east',
      });

      if (p.isCancel(filterText)) {
        return null;
      }

      const filter = filterText.toLowerCase();
      const filtered = sorted.filter(ds =>
        ds.name.toLowerCase().includes(filter) ||
        ds.type.toLowerCase().includes(filter)
      );

      if (filtered.length === 0) {
        p.log.warn(`No data sources match "${filterText}". Showing all.`);
      } else {
        p.log.info(`Found ${filtered.length} matching data sources`);

        const filteredOptions = filtered.map(ds => ({
          value: ds.uid,
          label: ds.name,
          hint: ds.type,
        }));

        const selected = await p.multiselect({
          message: 'Select data sources (space to toggle):',
          options: filteredOptions,
          initialValues: filtered.length > 0 ? [filtered[0]!.uid] : [],
          required: false,
        });

        if (p.isCancel(selected)) {
          return null;
        }

        return dataSources.filter(ds => selected.includes(ds.uid));
      }
    }
  }

  // Show ALL data sources - no limit
  const selected = await p.multiselect({
    message: 'Select data sources (space to toggle):',
    options,
    initialValues: sorted.length > 0 ? [sorted[0]!.uid] : [],
    required: false,
  });

  if (p.isCancel(selected)) {
    return null;
  }

  return dataSources.filter(ds => selected.includes(ds.uid));
}
