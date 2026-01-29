import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type {
  ScriptGeneratorPort,
  ScriptGeneratorOptions,
  GeneratedScript,
} from '../../../ports/outbound/script-generator-port.js';
import type { AlertRule, CloudWatchQuery, PrometheusQuery } from '../../../domain/entities/alert.js';
import type { Customer } from '../../../domain/entities/customer.js';

export class TypeScriptScriptGenerator implements ScriptGeneratorPort {
  private defaultOutputDirectory: string;

  constructor(defaultOutputDirectory: string) {
    this.defaultOutputDirectory = defaultOutputDirectory;
  }

  async generateScript(options: ScriptGeneratorOptions): Promise<GeneratedScript> {
    const { customer, grafanaUrl, alerts } = options;
    const timestamp = new Date().toISOString().slice(0, 10);
    // Sanitize folder name for filename (replace / with -)
    const safeFolderName = customer.grafanaFolder.replace(/\//g, '-').replace(/^-|-$/g, '');
    const filename = `${safeFolderName}-alerts-${timestamp}.ts`;

    const content = this.generateContent(customer, grafanaUrl, alerts);

    return {
      filename,
      content,
      alertCount: alerts.length,
      timestamp: new Date().toISOString(),
    };
  }

  async writeScript(script: GeneratedScript, outputPath: string): Promise<string> {
    const fullPath = join(outputPath, script.filename);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, script.content, 'utf-8');
    return fullPath;
  }

  getDefaultOutputDirectory(): string {
    return this.defaultOutputDirectory;
  }

  private generateContent(
    customer: Customer,
    grafanaUrl: string,
    alerts: readonly AlertRule[]
  ): string {
    return `#!/usr/bin/env bun
/**
 * Grafana Alert Provisioning Script
 * Customer: ${customer.name}
 * Folder: ${customer.grafanaFolder}
 * Generated: ${new Date().toISOString()}
 * Alert Count: ${alerts.length}
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ============================================================================
// Load .env file
// ============================================================================

function loadEnv(): void {
  const scriptDir = dirname(import.meta.file);
  const envPath = join(scriptDir, '.env');

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log('Loaded .env from', envPath);
  }
}

loadEnv();

// ============================================================================
// Grafana Client
// ============================================================================

interface GrafanaConfig {
  url: string;
  apiKey: string;
}

interface GrafanaFolder {
  uid: string;
  title: string;
  url: string;
}

interface AlertRuleConfig {
  title: string;
  ruleGroup: string;
  folderUid: string;
  condition: string;
  data: AlertQueryModel[];
  noDataState: 'NoData' | 'Alerting' | 'OK';
  execErrState: 'Error' | 'Alerting' | 'OK';
  for: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface AlertQueryModel {
  refId: string;
  relativeTimeRange: { from: number; to: number };
  datasourceUid: string;
  model: CloudWatchQueryModel | PrometheusQueryModel | ReduceModel | ThresholdModel;
}

interface CloudWatchQueryModel {
  refId: string;
  namespace: string;
  metricName: string;
  statistic: string;
  dimensions: Record<string, string | string[]>;
  period: string;
  region: string;
  id: string;
  expression?: string;
  matchExact: boolean;
}

interface PrometheusQueryModel {
  refId: string;
  expr: string;
  legendFormat?: string;
  instant: boolean;
  range: boolean;
}

interface ReduceModel {
  refId: string;
  type: 'reduce';
  expression: string;
  reducer: string;
  settings?: { mode: string };
}

interface ThresholdModel {
  refId: string;
  type: 'threshold';
  expression: string;
  conditions: ThresholdCondition[];
}

interface ThresholdCondition {
  evaluator: { type: string; params: number[] };
}

class GrafanaClient {
  private config: GrafanaConfig;

  constructor(config: GrafanaConfig) {
    this.config = config;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = \`\${this.config.url}/api\${path}\`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': \`Bearer \${this.config.apiKey}\`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(\`Grafana API error: \${response.status} - \${body}\`);
    }

    // Handle 202 Accepted or 204 No Content for DELETE operations
    if (response.status === 202 || response.status === 204) {
      return {} as T;
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  async deleteRuleGroup(folderUid: string, ruleGroupName: string): Promise<void> {
    await this.request(\`/ruler/grafana/api/v1/rules/\${folderUid}/\${encodeURIComponent(ruleGroupName)}\`, {
      method: 'DELETE',
    });
  }

  async ensureFolder(path: string): Promise<GrafanaFolder> {
    // Handle nested folder paths like "NOC/AWS/Customer"
    const parts = path.split('/').map(p => p.trim()).filter(p => p.length > 0);

    if (parts.length === 0) {
      throw new Error('Folder path cannot be empty');
    }

    // Get all folders with their parent info using search API
    const allFolders = await this.request<Array<{
      uid: string;
      title: string;
      url: string;
      folderUid?: string;
    }>>('/search?type=dash-folder');

    let parentUid: string | undefined = undefined;
    let currentFolder: GrafanaFolder | undefined = undefined;

    for (const part of parts) {
      // Find folder at current level (matching title and parent)
      const existing = allFolders.find(f =>
        f.title === part &&
        (parentUid ? f.folderUid === parentUid : !f.folderUid)
      );

      if (existing) {
        console.log(\`Folder "\${part}" exists (uid: \${existing.uid})\`);
        currentFolder = { uid: existing.uid, title: existing.title, url: existing.url };
        parentUid = existing.uid;
      } else {
        // Create folder at this level
        const payload: { title: string; parentUid?: string } = { title: part };
        if (parentUid) {
          payload.parentUid = parentUid;
        }

        const created = await this.request<GrafanaFolder>('/folders', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        console.log(\`Created folder "\${part}" (uid: \${created.uid})\${parentUid ? \` under \${parentUid}\` : ''}\`);
        currentFolder = created;
        parentUid = created.uid;

        // Add to our local cache so subsequent lookups work
        allFolders.push({ uid: created.uid, title: part, url: created.url, folderUid: payload.parentUid });
      }
    }

    return currentFolder!;
  }

  async createRuleGroup(
    folderUid: string,
    ruleGroupName: string,
    alerts: AlertRuleConfig[]
  ): Promise<void> {
    // Use Ruler API format - creates all rules in one group atomically
    // This avoids the issue where POST replaces the entire rule group
    const payload = {
      name: ruleGroupName,
      interval: '1m',
      rules: alerts.map(config => ({
        grafana_alert: {
          title: config.title,
          condition: config.condition,
          data: config.data,
          no_data_state: config.noDataState,
          exec_err_state: config.execErrState,
        },
        for: config.for,
        labels: config.labels,
        annotations: config.annotations,
      })),
    };

    await this.request(\`/ruler/grafana/api/v1/rules/\${folderUid}\`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    console.log(\`Created rule group "\${ruleGroupName}" with \${alerts.length} alert(s)\`);
  }

  async setContactPointForPolicy(contactPoint: string, folderUid: string): Promise<void> {
    // Get current notification policy tree
    const policy = await this.request<{ receiver: string; routes?: unknown[] }>('/v1/provisioning/policies');

    // Add/update route for this folder
    const routes = policy.routes ?? [];

    const existingIndex = routes.findIndex((r: unknown) => {
      const route = r as { object_matchers?: Array<[string, string, string]> };
      return route.object_matchers?.some(m => m[0] === 'grafana_folder' && m[2] === folderUid);
    });

    // object_matchers format is array of tuples: [["label", "operator", "value"]]
    const newRoute = {
      receiver: contactPoint,
      object_matchers: [['grafana_folder', '=', folderUid]],
      continue: false,
    };

    if (existingIndex >= 0) {
      routes[existingIndex] = newRoute;
    } else {
      routes.push(newRoute);
    }

    await this.request('/v1/provisioning/policies', {
      method: 'PUT',
      body: JSON.stringify({ ...policy, routes }),
    });

    console.log(\`Set contact point "\${contactPoint}" for folder \${folderUid}\`);
  }
}

// ============================================================================
// Alert Definitions
// ============================================================================

${this.generateAlertDefinitions(alerts)}

// ============================================================================
// Provisioning Logic
// ============================================================================

interface ProvisioningResult {
  success: boolean;
  created: string[];
  failed: Array<{ title: string; error: string }>;
}

async function provisionAlerts(config: GrafanaConfig): Promise<ProvisioningResult> {
  const client = new GrafanaClient(config);
  const result: ProvisioningResult = { success: true, created: [], failed: [] };

  // Ensure folder exists
  console.log('\\n📁 Ensuring folder exists...');
  const folder = await client.ensureFolder('${customer.grafanaFolder}');

  // Group alerts by rule group (Grafana Ruler API replaces entire group on POST)
  const alertsByGroup = new Map<string, typeof ALERTS>();
  for (const alert of ALERTS) {
    const existing = alertsByGroup.get(alert.ruleGroup) ?? [];
    alertsByGroup.set(alert.ruleGroup, [...existing, alert]);
  }

  // Create rule groups (one POST per group with all rules)
  console.log(\`\\n🚨 Creating \${alertsByGroup.size} rule group(s) with \${ALERTS.length} total alert(s)...\\n\`);

  for (const [ruleGroup, alerts] of alertsByGroup) {
    try {
      await client.createRuleGroup(
        folder.uid,
        ruleGroup,
        alerts.map(a => ({ ...a, folderUid: folder.uid }))
      );
      for (const alert of alerts) {
        result.created.push(alert.title);
      }
    } catch (error) {
      result.success = false;
      for (const alert of alerts) {
        result.failed.push({
          title: alert.title,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Set default contact point for folder
  console.log('\\n📬 Setting notification policy...');
  try {
    await client.setContactPointForPolicy('${customer.defaultContactPoint}', folder.uid);
  } catch (error) {
    console.error('Warning: Failed to set contact point:', error);
  }

  return result;
}

// ============================================================================
// Deletion Logic
// ============================================================================

interface DeletionResult {
  success: boolean;
  deleted: string[];
  failed: Array<{ name: string; error: string }>;
}

async function deleteAlerts(config: GrafanaConfig): Promise<DeletionResult> {
  const client = new GrafanaClient(config);
  const result: DeletionResult = { success: true, deleted: [], failed: [] };

  // Find the folder
  console.log('\\n📁 Finding folder...');
  const folder = await client.ensureFolder('${customer.grafanaFolder}');
  console.log(\`Found folder: \${folder.title} (uid: \${folder.uid})\`);

  // Get unique rule groups from ALERTS
  const ruleGroups = [...new Set(ALERTS.map(a => a.ruleGroup))];

  console.log(\`\\n🗑️  Deleting \${ruleGroups.length} rule group(s)...\\n\`);

  for (const ruleGroup of ruleGroups) {
    try {
      await client.deleteRuleGroup(folder.uid, ruleGroup);
      console.log(\`  ✓ Deleted: \${ruleGroup}\`);
      result.deleted.push(ruleGroup);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // 404 means already deleted, which is fine
      if (errorMsg.includes('404')) {
        console.log(\`  - Skipped (not found): \${ruleGroup}\`);
      } else {
        result.success = false;
        result.failed.push({ name: ruleGroup, error: errorMsg });
        console.log(\`  ✗ Failed: \${ruleGroup} - \${errorMsg}\`);
      }
    }
  }

  return result;
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDeleteMode = args.includes('--delete');

  const apiKey = process.env['GRAFANA_API_KEY'];

  if (!apiKey) {
    console.error('Error: GRAFANA_API_KEY environment variable is required');
    console.error('\\nUsage:');
    console.error('  GRAFANA_API_KEY=xxx bun run ' + import.meta.file);
    console.error('  GRAFANA_API_KEY=xxx bun run ' + import.meta.file + ' --delete');
    process.exit(1);
  }

  const config: GrafanaConfig = {
    url: '${grafanaUrl}',
    apiKey,
  };

  if (isDeleteMode) {
    // DELETE MODE
    console.log('🗑️  Starting Grafana alert DELETION...');
    console.log(\`   Customer: ${customer.name}\`);
    console.log(\`   Folder: ${customer.grafanaFolder}\`);
    console.log(\`   Grafana URL: \${config.url}\`);

    try {
      const result = await deleteAlerts(config);

      console.log('\\n' + '='.repeat(60));
      console.log('📊 Deletion Summary');
      console.log('='.repeat(60));
      console.log(\`✅ Deleted: \${result.deleted.length} rule group(s)\`);

      if (result.failed.length > 0) {
        console.log(\`❌ Failed: \${result.failed.length} rule group(s)\`);
        for (const failure of result.failed) {
          console.log(\`   - \${failure.name}: \${failure.error}\`);
        }
      }

      if (result.deleted.length > 0) {
        console.log('\\n✨ Done! Run this script without --delete to provision new alerts.');
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('\\n❌ Fatal error:', error);
      process.exit(1);
    }
  } else {
    // CREATE MODE
    console.log('🚀 Starting Grafana alert provisioning...');
    console.log(\`   Customer: ${customer.name}\`);
    console.log(\`   Folder: ${customer.grafanaFolder}\`);
    console.log(\`   Alerts: \${ALERTS.length}\`);
    console.log(\`   Grafana URL: \${config.url}\`);

    try {
      const result = await provisionAlerts(config);

      console.log('\\n' + '='.repeat(60));
      console.log('📊 Provisioning Summary');
      console.log('='.repeat(60));
      console.log(\`✅ Created: \${result.created.length} alerts\`);

      if (result.failed.length > 0) {
        console.log(\`❌ Failed: \${result.failed.length} alerts\`);
        for (const failure of result.failed) {
          console.log(\`   - \${failure.title}: \${failure.error}\`);
        }
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('\\n❌ Fatal error:', error);
      process.exit(1);
    }
  }
}

main();
`;
  }

  private generateAlertDefinitions(alerts: readonly AlertRule[]): string {
    const definitions = alerts.map(alert => this.generateAlertDefinition(alert));
    return `const ALERTS: Omit<AlertRuleConfig, 'folderUid'>[] = [
${definitions.join(',\n')}
];`;
  }

  private generateAlertDefinition(alert: AlertRule): string {
    const queryData = this.generateQueryData(alert);

    return `  {
    title: ${JSON.stringify(alert.title)},
    ruleGroup: ${JSON.stringify(alert.ruleGroup)},
    condition: 'C',
    noDataState: 'OK',
    execErrState: 'Error',
    for: ${JSON.stringify(alert.forDuration)},
    labels: ${JSON.stringify(alert.labels, null, 6).replace(/\n/g, '\n    ')},
    annotations: ${JSON.stringify(alert.annotations, null, 6).replace(/\n/g, '\n    ')},
    data: ${JSON.stringify(queryData, null, 6).replace(/\n/g, '\n    ')}
  }`;
  }

  private generateQueryData(alert: AlertRule): AlertQueryModel[] {
    const queries: AlertQueryModel[] = [];

    if (alert.query.type === 'cloudwatch') {
      const cwQuery = alert.query as CloudWatchQuery;

      // Build dimensions object for multi-dimensional query
      // Use array of values for the dimension key to query multiple resources
      const dimensions: Record<string, string | string[]> = {};
      dimensions[cwQuery.dimensionKey] = cwQuery.dimensionValues as string[];

      queries.push({
        refId: 'A',
        relativeTimeRange: { from: 300, to: 0 },
        datasourceUid: alert.dataSource.uid,
        model: {
          refId: 'A',
          namespace: cwQuery.namespace,
          metricName: cwQuery.metricName,
          statistic: cwQuery.statistic,
          dimensions,
          period: String(cwQuery.period),
          region: cwQuery.region,
          id: 'a',
          // matchExact: false is required for wildcard queries
          // When using '*', CloudWatch returns all matching dimension values
          // matchExact: true would look for literal '*' which doesn't exist
          matchExact: !cwQuery.dimensionValues.includes('*'),
        },
      });
    } else {
      const promQuery = alert.query as PrometheusQuery;
      queries.push({
        refId: 'A',
        relativeTimeRange: { from: 300, to: 0 },
        datasourceUid: alert.dataSource.uid,
        model: {
          refId: 'A',
          expr: promQuery.expr,
          legendFormat: promQuery.legendFormat,
          instant: true,
          range: false,
        },
      });
    }

    // Add reduce expression
    // For multi-dimensional queries, this operates on each series independently
    queries.push({
      refId: 'B',
      relativeTimeRange: { from: 0, to: 0 },
      datasourceUid: '__expr__',
      model: {
        refId: 'B',
        type: 'reduce',
        expression: 'A',
        reducer: 'last',
        settings: { mode: 'dropNN' },
      },
    });

    // Add threshold condition
    // For multi-dimensional queries, Grafana evaluates each series
    // and fires an alert for each series that breaches the threshold
    queries.push({
      refId: 'C',
      relativeTimeRange: { from: 0, to: 0 },
      datasourceUid: '__expr__',
      model: {
        refId: 'C',
        type: 'threshold',
        expression: 'B',
        conditions: [
          {
            evaluator: {
              type: this.getEvaluatorType(alert.threshold.operator),
              params: [alert.threshold.value],
            },
          },
        ],
      },
    });

    return queries;
  }

  private getEvaluatorType(operator: string): string {
    const map: Record<string, string> = {
      gt: 'gt',
      gte: 'gte',
      lt: 'lt',
      lte: 'lte',
      eq: 'eq',
      neq: 'neq',
    };
    return map[operator] ?? 'gt';
  }
}

interface AlertQueryModel {
  refId: string;
  relativeTimeRange: { from: number; to: number };
  datasourceUid: string;
  model: unknown;
}

export function createTypeScriptScriptGenerator(
  defaultOutputDirectory: string
): ScriptGeneratorPort {
  return new TypeScriptScriptGenerator(defaultOutputDirectory);
}
