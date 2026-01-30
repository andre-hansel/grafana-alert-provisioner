/**
 * Dashboard Preview Prompt
 *
 * Shows a preview of selected dashboards before generation.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { Customer } from '../../../../domain/entities/customer.js';
import type { DashboardSelection, DashboardPreviewResult } from '../../../../domain/entities/dashboard.js';

export interface DashboardPreviewOptions {
  /** Customer configuration */
  customer: Customer;
  /** Grafana URL */
  grafanaUrl: string;
  /** CloudWatch datasource UID */
  datasourceUid: string;
  /** Default region for dashboards */
  defaultRegion: string;
  /** Selected dashboards to deploy */
  selectedDashboards: readonly DashboardSelection[];
  /** Services without templates (gaps) */
  gaps: readonly string[];
}

/**
 * Run the dashboard preview prompt.
 * Shows configuration summary and selected dashboards.
 */
export async function runDashboardPreviewPrompt(
  options: DashboardPreviewOptions
): Promise<DashboardPreviewResult> {
  const {
    customer,
    grafanaUrl,
    datasourceUid,
    defaultRegion,
    selectedDashboards,
    gaps,
  } = options;

  p.log.step(pc.cyan('Dashboard Preview'));

  const lines: string[] = [
    `${pc.bold('Customer:')} ${customer.name}`,
    `${pc.bold('Folder:')} ${customer.grafanaFolder}`,
    `${pc.bold('Grafana URL:')} ${grafanaUrl}`,
    `${pc.bold('Datasource UID:')} ${datasourceUid}`,
    `${pc.bold('Default Region:')} ${defaultRegion}`,
    '',
    `${pc.bold('Dashboards to deploy:')}`,
  ];

  for (const dash of selectedDashboards) {
    const title = `${customer.name} - ${dash.template.title}`;
    lines.push(`  ${pc.green('•')} ${title}`);
    lines.push(`    ${pc.dim(`Template: ${dash.template.filename}`)}`);
    lines.push(`    ${pc.dim(`Regions: ${dash.regions.join(', ')} (${dash.totalResourceCount} resources)`)}`);
  }

  if (gaps.length > 0) {
    lines.push('');
    lines.push(`${pc.yellow('⚠ Services without dashboards:')}`);
    for (const gap of gaps) {
      lines.push(`  ${pc.yellow('•')} ${gap.toUpperCase()}`);
    }
  }

  p.note(lines.join('\n'), 'Deployment Preview');

  const confirmed = await p.confirm({
    message: 'Generate deployment script?',
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    return { confirmed: false };
  }

  return { confirmed: true };
}
