/**
 * Dashboard Script Generator
 *
 * Generates standalone TypeScript scripts for deploying Grafana dashboards.
 * Similar pattern to the alert script generator - creates self-contained scripts
 * that can be reviewed and executed independently.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { DashboardTemplate } from '../../../config/dashboard-service-map.js';

export interface DashboardConfig {
  /** Service type (e.g., 'ec2', 'rds') */
  service: string;
  /** Template metadata */
  template: DashboardTemplate;
  /** Full path to template JSON file */
  templatePath: string;
  /** Customer-specific title */
  title: string;
}

export interface DashboardScriptOptions {
  /** Customer name */
  customer: string;
  /** Grafana folder path (e.g., "NOC-Monitoring/AWS/Customer-123") */
  folderPath: string;
  /** Grafana URL */
  grafanaUrl: string;
  /** CloudWatch datasource UID */
  datasourceUid: string;
  /** Default region for dashboards */
  defaultRegion: string;
  /** Dashboards to deploy */
  dashboards: DashboardConfig[];
}

export interface GeneratedDashboardScript {
  /** Generated filename */
  filename: string;
  /** Script content */
  content: string;
  /** Number of dashboards */
  dashboardCount: number;
  /** Generation timestamp */
  timestamp: string;
}

export class DashboardScriptGenerator {
  constructor(_templatesPath: string) {
    // Templates path stored for potential future use
  }

  async generateScript(options: DashboardScriptOptions): Promise<GeneratedDashboardScript> {
    const { customer, folderPath, grafanaUrl, datasourceUid, defaultRegion, dashboards } = options;
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeFolderName = folderPath.replace(/\//g, '-').replace(/^-|-$/g, '');
    const filename = `${safeFolderName}-dashboards-${timestamp}.ts`;

    // Load all dashboard templates
    const dashboardJsons: Array<{ config: DashboardConfig; json: string }> = [];
    for (const config of dashboards) {
      const templateContent = await readFile(config.templatePath, 'utf-8');
      const templateJson = JSON.parse(templateContent);

      // Customize the template
      const customized = this.customizeDashboard(templateJson, {
        title: config.title,
        datasourceUid,
        defaultRegion,
      });

      dashboardJsons.push({
        config,
        json: JSON.stringify(customized, null, 2),
      });
    }

    const content = this.generateContent({
      customer,
      folderPath,
      grafanaUrl,
      dashboards: dashboardJsons,
    });

    return {
      filename,
      content,
      dashboardCount: dashboards.length,
      timestamp: new Date().toISOString(),
    };
  }

  async writeScript(script: GeneratedDashboardScript, outputPath: string): Promise<string> {
    const fullPath = join(outputPath, script.filename);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, script.content, 'utf-8');
    return fullPath;
  }

  private customizeDashboard(
    template: Record<string, unknown>,
    options: {
      title: string;
      datasourceUid: string;
      defaultRegion: string;
    }
  ): Record<string, unknown> {
    const dashboard = JSON.parse(JSON.stringify(template));

    // Update title
    dashboard.title = options.title;

    // Clear ID and UID for new dashboard creation
    dashboard.id = null;
    dashboard.uid = null;

    // Update templating variables
    if (dashboard.templating && Array.isArray(dashboard.templating.list)) {
      for (const variable of dashboard.templating.list) {
        // Update datasource variable
        if (variable.name === 'datasource' && variable.type === 'datasource') {
          variable.current = {
            selected: true,
            text: options.datasourceUid,
            value: options.datasourceUid,
          };
        }

        // Update region variable default
        if (variable.name === 'region' && variable.type === 'custom') {
          // Set default region
          if (variable.options && Array.isArray(variable.options)) {
            for (const opt of variable.options) {
              opt.selected = opt.value === options.defaultRegion;
            }
          }
          variable.current = {
            selected: true,
            text: options.defaultRegion,
            value: options.defaultRegion,
          };
        }

        // Update query variables to use correct datasource
        if (variable.type === 'query' && variable.datasource) {
          variable.datasource.uid = '${datasource}';
        }
      }
    }

    return dashboard;
  }

  private generateContent(options: {
    customer: string;
    folderPath: string;
    grafanaUrl: string;
    dashboards: Array<{ config: DashboardConfig; json: string }>;
  }): string {
    const { customer, folderPath, grafanaUrl, dashboards } = options;

    // Generate dashboard definitions
    const dashboardDefs = dashboards.map((d) => {
      return `  {
    service: ${JSON.stringify(d.config.service)},
    title: ${JSON.stringify(d.config.title)},
    dashboard: ${d.json.split('\n').map((line, idx) => idx === 0 ? line : '    ' + line).join('\n')}
  }`;
    }).join(',\n');

    return `#!/usr/bin/env bun
/**
 * Grafana Dashboard Provisioning Script
 * Customer: ${customer}
 * Folder: ${folderPath}
 * Generated: ${new Date().toISOString()}
 * Dashboard Count: ${dashboards.length}
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

interface DashboardDefinition {
  service: string;
  title: string;
  dashboard: Record<string, unknown>;
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

    if (response.status === 204) {
      return {} as T;
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  async ensureFolder(path: string): Promise<GrafanaFolder> {
    const parts = path.split('/').map(p => p.trim()).filter(p => p.length > 0);

    if (parts.length === 0) {
      throw new Error('Folder path cannot be empty');
    }

    const allFolders = await this.request<Array<{
      uid: string;
      title: string;
      url: string;
      folderUid?: string;
    }>>('/search?type=dash-folder');

    let parentUid: string | undefined = undefined;
    let currentFolder: GrafanaFolder | undefined = undefined;

    for (const part of parts) {
      const existing = allFolders.find(f =>
        f.title === part &&
        (parentUid ? f.folderUid === parentUid : !f.folderUid)
      );

      if (existing) {
        console.log(\`Folder "\${part}" exists (uid: \${existing.uid})\`);
        currentFolder = { uid: existing.uid, title: existing.title, url: existing.url };
        parentUid = existing.uid;
      } else {
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
        allFolders.push({ uid: created.uid, title: part, url: created.url, folderUid: payload.parentUid });
      }
    }

    return currentFolder!;
  }

  async createOrUpdateDashboard(
    folderUid: string,
    dashboard: Record<string, unknown>
  ): Promise<{ uid: string; url: string; version: number }> {
    const payload = {
      dashboard: {
        ...dashboard,
        id: null, // Let Grafana assign ID
      },
      folderUid,
      overwrite: true, // Update if exists
      message: 'Deployed via dashboard provisioner',
    };

    const result = await this.request<{
      uid: string;
      url: string;
      version: number;
      status: string;
    }>('/dashboards/db', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      uid: result.uid,
      url: result.url,
      version: result.version,
    };
  }

  async deleteDashboard(uid: string): Promise<void> {
    await this.request(\`/dashboards/uid/\${uid}\`, {
      method: 'DELETE',
    });
  }

  async getDashboardByTitle(title: string, folderUid: string): Promise<{ uid: string } | null> {
    try {
      const results = await this.request<Array<{
        uid: string;
        title: string;
        folderUid: string;
      }>>(\`/search?query=\${encodeURIComponent(title)}&type=dash-db&folderUIDs=\${folderUid}\`);

      const match = results.find(r => r.title === title);
      return match ? { uid: match.uid } : null;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Dashboard Definitions
// ============================================================================

const DASHBOARDS: DashboardDefinition[] = [
${dashboardDefs}
];

// ============================================================================
// Provisioning Logic
// ============================================================================

interface ProvisioningResult {
  success: boolean;
  created: Array<{ title: string; uid: string; url: string }>;
  failed: Array<{ title: string; error: string }>;
}

async function provisionDashboards(config: GrafanaConfig): Promise<ProvisioningResult> {
  const client = new GrafanaClient(config);
  const result: ProvisioningResult = { success: true, created: [], failed: [] };

  console.log('\\n\uD83D\uDCC1 Ensuring folder exists...');
  const folder = await client.ensureFolder('${folderPath}');

  console.log(\`\\n\uD83D\uDCCA Creating \${DASHBOARDS.length} dashboard(s)...\\n\`);

  for (const def of DASHBOARDS) {
    try {
      const created = await client.createOrUpdateDashboard(folder.uid, def.dashboard);
      console.log(\`  \u2713 \${def.title} (uid: \${created.uid})\`);
      result.created.push({
        title: def.title,
        uid: created.uid,
        url: created.url,
      });
    } catch (error) {
      result.success = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(\`  \u2717 \${def.title}: \${errorMsg}\`);
      result.failed.push({
        title: def.title,
        error: errorMsg,
      });
    }
  }

  return result;
}

// ============================================================================
// Deletion Logic
// ============================================================================

interface DeletionResult {
  success: boolean;
  deleted: string[];
  failed: Array<{ title: string; error: string }>;
}

async function deleteDashboards(config: GrafanaConfig): Promise<DeletionResult> {
  const client = new GrafanaClient(config);
  const result: DeletionResult = { success: true, deleted: [], failed: [] };

  console.log('\\n\uD83D\uDCC1 Finding folder...');
  const folder = await client.ensureFolder('${folderPath}');
  console.log(\`Found folder: \${folder.title} (uid: \${folder.uid})\`);

  console.log(\`\\n\uD83D\uDDD1\uFE0F  Deleting \${DASHBOARDS.length} dashboard(s)...\\n\`);

  for (const def of DASHBOARDS) {
    try {
      const existing = await client.getDashboardByTitle(def.title, folder.uid);
      if (existing) {
        await client.deleteDashboard(existing.uid);
        console.log(\`  \u2713 Deleted: \${def.title}\`);
        result.deleted.push(def.title);
      } else {
        console.log(\`  - Skipped (not found): \${def.title}\`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('404')) {
        console.log(\`  - Skipped (not found): \${def.title}\`);
      } else {
        result.success = false;
        result.failed.push({ title: def.title, error: errorMsg });
        console.log(\`  \u2717 Failed: \${def.title} - \${errorMsg}\`);
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
    console.log('\uD83D\uDDD1\uFE0F  Starting Grafana dashboard DELETION...');
    console.log(\`   Customer: ${customer}\`);
    console.log(\`   Folder: ${folderPath}\`);
    console.log(\`   Grafana URL: \${config.url}\`);

    try {
      const result = await deleteDashboards(config);

      console.log('\\n' + '='.repeat(60));
      console.log('\uD83D\uDCCA Deletion Summary');
      console.log('='.repeat(60));
      console.log(\`\u2705 Deleted: \${result.deleted.length} dashboard(s)\`);

      if (result.failed.length > 0) {
        console.log(\`\u274C Failed: \${result.failed.length} dashboard(s)\`);
        for (const failure of result.failed) {
          console.log(\`   - \${failure.title}: \${failure.error}\`);
        }
      }

      if (result.deleted.length > 0) {
        console.log('\\n\u2728 Done! Run this script without --delete to provision new dashboards.');
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('\\n\u274C Fatal error:', error);
      process.exit(1);
    }
  } else {
    console.log('\uD83D\uDE80 Starting Grafana dashboard provisioning...');
    console.log(\`   Customer: ${customer}\`);
    console.log(\`   Folder: ${folderPath}\`);
    console.log(\`   Dashboards: \${DASHBOARDS.length}\`);
    console.log(\`   Grafana URL: \${config.url}\`);

    try {
      const result = await provisionDashboards(config);

      console.log('\\n' + '='.repeat(60));
      console.log('\uD83D\uDCCA Provisioning Summary');
      console.log('='.repeat(60));
      console.log(\`\u2705 Created: \${result.created.length} dashboard(s)\`);

      if (result.created.length > 0) {
        console.log('\\nDashboard URLs:');
        for (const d of result.created) {
          console.log(\`  - \${d.title}: \${config.url}\${d.url}\`);
        }
      }

      if (result.failed.length > 0) {
        console.log(\`\u274C Failed: \${result.failed.length} dashboard(s)\`);
        for (const failure of result.failed) {
          console.log(\`   - \${failure.title}: \${failure.error}\`);
        }
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('\\n\u274C Fatal error:', error);
      process.exit(1);
    }
  }
}

main();
`;
  }
}

export function createDashboardScriptGenerator(templatesPath: string): DashboardScriptGenerator {
  return new DashboardScriptGenerator(templatesPath);
}
