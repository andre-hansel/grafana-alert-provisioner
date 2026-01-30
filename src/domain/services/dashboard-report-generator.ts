/**
 * Dashboard Deployment Report Generator
 *
 * Generates a markdown report documenting dashboard deployment decisions.
 */

import type { DashboardMatch, DashboardSelection } from '../entities/dashboard.js';

export interface DashboardReportData {
  /** Customer name */
  customerName: string;
  /** Grafana folder path */
  folderPath: string;
  /** All matches from dashboard matching */
  matches: readonly DashboardMatch[];
  /** Services without dashboard templates */
  gaps: readonly string[];
  /** Final selections (what user chose to deploy) */
  selections: readonly DashboardSelection[];
  /** Grafana URL */
  grafanaUrl: string;
  /** Datasource UID used */
  datasourceUid: string;
  /** Default region */
  defaultRegion: string;
}

/**
 * Generate a markdown report for dashboard deployment.
 */
export function generateDashboardReport(data: DashboardReportData): string {
  const {
    customerName,
    folderPath,
    matches,
    gaps,
    selections,
    grafanaUrl,
    datasourceUid,
    defaultRegion,
  } = data;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const selectedDashboards = selections.filter(s => s.selected && s.hasTemplate);
  const deselectedDashboards = selections.filter(s => !s.selected && s.hasTemplate);

  // Group matches by service for summary
  const servicesSummary = new Map<string, { regions: string[]; resourceCount: number }>();
  for (const match of matches) {
    const existing = servicesSummary.get(match.service);
    if (existing) {
      if (!existing.regions.includes(match.region)) {
        existing.regions.push(match.region);
      }
      existing.resourceCount += match.resourceCount;
    } else {
      servicesSummary.set(match.service, {
        regions: [match.region],
        resourceCount: match.resourceCount,
      });
    }
  }

  const lines: string[] = [
    '# Dashboard Deployment Report',
    '',
    `**Customer:** ${customerName}`,
    `**Generated:** ${dateStr}`,
    '',
    '---',
    '',
    '## Configuration',
    '',
    `| Setting | Value |`,
    `|---------|-------|`,
    `| Grafana URL | ${grafanaUrl} |`,
    `| Folder Path | ${folderPath} |`,
    `| Datasource UID | ${datasourceUid} |`,
    `| Default Region | ${defaultRegion} |`,
    '',
    '---',
    '',
    '## Summary',
    '',
    `- **Services Discovered:** ${servicesSummary.size}`,
    `- **Dashboard Templates Available:** ${selectedDashboards.length + deselectedDashboards.length}`,
    `- **Dashboards Deployed:** ${selectedDashboards.length}`,
    `- **Dashboards Skipped:** ${deselectedDashboards.length}`,
    `- **Services Without Templates:** ${gaps.length}`,
    '',
  ];

  // Deployed Dashboards
  if (selectedDashboards.length > 0) {
    lines.push('---', '', '## Deployed Dashboards', '');
    lines.push('| Service | Dashboard Title | Template | Regions | Resources |');
    lines.push('|---------|-----------------|----------|---------|-----------|');

    for (const dash of selectedDashboards) {
      lines.push(
        `| ${dash.service.toUpperCase()} | ${dash.template.title} | ${dash.template.filename} | ${dash.regions.join(', ')} | ${dash.totalResourceCount} |`
      );
    }
    lines.push('');
  }

  // Skipped Dashboards
  if (deselectedDashboards.length > 0) {
    lines.push('---', '', '## Skipped Dashboards', '');
    lines.push('The following dashboards had templates available but were not selected for deployment:', '');
    lines.push('| Service | Dashboard Title | Template |');
    lines.push('|---------|-----------------|----------|');

    for (const dash of deselectedDashboards) {
      lines.push(
        `| ${dash.service.toUpperCase()} | ${dash.template.title} | ${dash.template.filename} |`
      );
    }
    lines.push('');
  }

  // Template Gaps
  if (gaps.length > 0) {
    lines.push('---', '', '## Services Without Dashboard Templates', '');
    lines.push('The following services were discovered but have no dashboard template available:', '');

    for (const gap of gaps) {
      lines.push(`- **${gap.toUpperCase()}**`);
    }
    lines.push('');
    lines.push('*Consider creating dashboard templates for these services.*');
    lines.push('');
  }

  // Resource Details by Service
  lines.push('---', '', '## Resource Details by Service', '');

  for (const [service, summary] of servicesSummary) {
    const template = selections.find(s => s.service === service)?.template;
    const status = template ? '✓ Dashboard deployed' : '⚠ No template';

    lines.push(`### ${service.toUpperCase()}`);
    lines.push('');
    lines.push(`- **Resources:** ${summary.resourceCount}`);
    lines.push(`- **Regions:** ${summary.regions.join(', ')}`);
    lines.push(`- **Status:** ${status}`);
    if (template) {
      lines.push(`- **Template:** ${template.filename}`);
      lines.push(`- **CloudWatch Namespace:** ${template.namespace}`);
      lines.push(`- **Dimension Key:** ${template.dimensionKey}`);
    }
    lines.push('');
  }

  // Footer
  lines.push('---', '');
  lines.push('*Report generated by Grafana Provisioner*');

  return lines.join('\n');
}
