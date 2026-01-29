import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { TemplateMatch, AlertSeverity } from '../../../../domain/entities/template.js';
import type { PendingAlert, AlertConfiguration } from '../../../../domain/entities/alert.js';
import type { Customer } from '../../../../domain/entities/customer.js';
import type { GrafanaContactPoint, GrafanaDataSource } from '../../../../ports/outbound/grafana-port.js';
import { createAlertBuilder } from '../../../../domain/services/alert-builder.js';

export interface AlertCustomizationOptions {
  matches: readonly TemplateMatch[];
  customer: Customer;
  contactPoints: readonly GrafanaContactPoint[];
  dataSources: readonly GrafanaDataSource[];
}

export interface AlertCustomizationResult {
  pendingAlerts: readonly PendingAlert[];
  confirmed: boolean;
}

/**
 * Alert customization prompt - now template-based.
 * Each match is one template covering multiple resources.
 * One alert rule per template using multi-dimensional alerting.
 */
export async function runAlertCustomizationPrompt(
  options: AlertCustomizationOptions
): Promise<AlertCustomizationResult> {
  const { matches, customer, contactPoints, dataSources } = options;

  p.intro(pc.bgBlue(pc.black(' Alert Customization ')));

  // Show summary
  const totalResources = matches.reduce((sum, m) => sum + m.resources.length, 0);
  p.log.info(`${matches.length} alert rules covering ${totalResources} resources`);

  // Show which data sources are available
  const dsNames = dataSources.map(ds => {
    const icon = ds.type.toLowerCase() === 'cloudwatch' ? '☁️' : '📊';
    return `${icon} ${ds.name}`;
  }).join(', ');
  p.log.info(`Available data sources: ${dsNames}`);

  const builder = createAlertBuilder();
  const pendingAlerts: PendingAlert[] = [];

  // Get the default data source (first one in the list)
  const defaultDataSource = dataSources[0];
  if (!defaultDataSource) {
    p.log.error(pc.red('No data sources available'));
    return { pendingAlerts: [], confirmed: false };
  }

  // Ask if user wants to customize templates or use defaults
  const customizeChoice = await p.select({
    message: 'How would you like to configure alerts?',
    options: [
      {
        value: 'defaults',
        label: 'Use default settings for all',
        hint: 'Quickest - uses template defaults',
      },
      {
        value: 'customize',
        label: 'Customize each template',
        hint: `Configure each of the ${matches.length} alert templates`,
      },
    ],
  });

  if (p.isCancel(customizeChoice)) {
    return { pendingAlerts: [], confirmed: false };
  }

  if (customizeChoice === 'defaults') {
    // Use defaults for all
    for (const match of matches) {
      const config = builder.createDefaultConfiguration(match.template, customer);
      const configWithDs = {
        ...config,
        dataSourceUid: defaultDataSource.uid,
        dataSourceName: defaultDataSource.name,
        dataSourceType: defaultDataSource.type.toLowerCase() === 'cloudwatch' ? 'cloudwatch' : 'prometheus',
      } as AlertConfiguration;

      pendingAlerts.push({
        template: match.template,
        resources: match.resources,
        configuration: configWithDs,
        region: match.region,
      });
    }
  } else {
    // Customize each template
    for (const match of matches) {
      const { template, resources, region } = match;

      p.log.info(
        `\n${pc.cyan(template.name)} ${pc.dim(`(${region}, covers ${resources.length} ${template.service} resources)`)}`
      );

      const config = await customizeConfiguration(
        builder.createDefaultConfiguration(template, customer),
        template,
        contactPoints,
        dataSources
      );

      if (!config) {
        return { pendingAlerts: [], confirmed: false };
      }

      pendingAlerts.push({
        template,
        resources,
        configuration: config,
        region,
      });
    }
  }

  // Show summary
  p.log.success(`Configured ${pendingAlerts.length} alert rules`);

  // Show breakdown by service
  const byService = new Map<string, number>();
  for (const pending of pendingAlerts) {
    const count = byService.get(pending.template.service) ?? 0;
    byService.set(pending.template.service, count + 1);
  }

  const serviceSummary = Array.from(byService.entries())
    .map(([service, count]) => `${service}: ${count}`)
    .join(', ');
  p.log.info(`By service: ${serviceSummary}`);

  const confirmed = await p.confirm({
    message: 'Finalize alert configuration?',
    initialValue: true,
  });

  if (p.isCancel(confirmed)) {
    return { pendingAlerts: [], confirmed: false };
  }

  return { pendingAlerts, confirmed };
}

async function customizeConfiguration(
  defaults: AlertConfiguration,
  template: { customizable: readonly string[]; name: string },
  contactPoints: readonly GrafanaContactPoint[],
  dataSources: readonly GrafanaDataSource[]
): Promise<AlertConfiguration | null> {
  let config = { ...defaults };

  // Data source selection (always show if multiple available)
  if (dataSources.length > 1) {
    const dsOptions = dataSources.map(ds => {
      const icon = ds.type.toLowerCase() === 'cloudwatch' ? '☁️' : '📊';
      return {
        value: ds.uid,
        label: `${icon} ${ds.name}`,
        hint: ds.type,
      };
    });

    const selectedDsUid = await p.select({
      message: 'Data source:',
      options: dsOptions,
      initialValue: dataSources[0]?.uid,
    });

    if (p.isCancel(selectedDsUid)) {
      return null;
    }

    const selectedDs = dataSources.find(ds => ds.uid === selectedDsUid);
    if (selectedDs) {
      const dsType = selectedDs.type.toLowerCase() === 'cloudwatch' ? 'cloudwatch' : 'prometheus';
      config = {
        ...config,
        dataSourceUid: selectedDs.uid,
        dataSourceName: selectedDs.name,
        dataSourceType: dsType as 'cloudwatch' | 'prometheus',
      };
    }
  } else if (dataSources.length === 1) {
    const ds = dataSources[0]!;
    const dsType = ds.type.toLowerCase() === 'cloudwatch' ? 'cloudwatch' : 'prometheus';
    config = {
      ...config,
      dataSourceUid: ds.uid,
      dataSourceName: ds.name,
      dataSourceType: dsType as 'cloudwatch' | 'prometheus',
    };
  }

  // Threshold
  if (template.customizable.includes('threshold')) {
    const threshold = await p.text({
      message: 'Threshold value:',
      initialValue: String(defaults.threshold),
      validate: value => {
        const num = parseFloat(value);
        if (isNaN(num)) {
          return 'Must be a number';
        }
        return undefined;
      },
    });

    if (p.isCancel(threshold)) {
      return null;
    }

    config = { ...config, threshold: parseFloat(threshold) };
  }

  // Evaluation interval
  if (template.customizable.includes('evaluation_interval')) {
    const interval = await p.text({
      message: 'Evaluation interval (e.g., 1m, 5m, 1h):',
      initialValue: defaults.evaluationInterval,
      validate: value => {
        if (!/^\d+[smh]$/.test(value)) {
          return 'Invalid format. Use: 1m, 5m, 1h, etc.';
        }
        return undefined;
      },
    });

    if (p.isCancel(interval)) {
      return null;
    }

    config = { ...config, evaluationInterval: interval };
  }

  // For duration
  if (template.customizable.includes('for_duration')) {
    const duration = await p.text({
      message: 'Alert duration before firing (e.g., 5m, 10m):',
      initialValue: defaults.forDuration,
      validate: value => {
        if (!/^\d+[smh]$/.test(value)) {
          return 'Invalid format. Use: 5m, 10m, 1h, etc.';
        }
        return undefined;
      },
    });

    if (p.isCancel(duration)) {
      return null;
    }

    config = { ...config, forDuration: duration };
  }

  // Severity
  if (template.customizable.includes('severity')) {
    const severity = await p.select({
      message: 'Alert severity:',
      options: [
        { value: 'critical', label: 'Critical', hint: 'Immediate action required' },
        { value: 'warning', label: 'Warning', hint: 'Attention needed soon' },
        { value: 'info', label: 'Info', hint: 'Informational alert' },
      ],
      initialValue: defaults.severity,
    });

    if (p.isCancel(severity)) {
      return null;
    }

    config = { ...config, severity: severity as AlertSeverity };
  }

  // Contact point
  if (template.customizable.includes('contact_point') && contactPoints.length > 0) {
    const contactPoint = await p.select({
      message: 'Contact point:',
      options: contactPoints.map(cp => ({
        value: cp.name,
        label: cp.name,
        hint: cp.type,
      })),
      initialValue: defaults.contactPoint,
    });

    if (p.isCancel(contactPoint)) {
      return null;
    }

    config = { ...config, contactPoint };
  }

  return config;
}
