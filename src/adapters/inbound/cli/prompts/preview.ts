import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { PendingAlert } from '../../../../domain/entities/alert.js';
import type { Customer } from '../../../../domain/entities/customer.js';
import type { AwsServiceType } from '../../../../domain/entities/aws-resource.js';

export interface PreviewResult {
  confirmed: boolean;
}

export async function runPreviewPrompt(
  pendingAlerts: readonly PendingAlert[],
  customer: Customer
): Promise<PreviewResult> {
  p.intro(pc.bgGreen(pc.black(' Dry-Run Preview ')));

  // Group by service
  const byService = new Map<AwsServiceType, PendingAlert[]>();
  for (const alert of pendingAlerts) {
    const service = alert.template.service;
    const existing = byService.get(service) ?? [];
    byService.set(service, [...existing, alert]);
  }

  // Count by severity
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const alert of pendingAlerts) {
    bySeverity[alert.configuration.severity]++;
  }

  // Count total resources covered
  const totalResources = pendingAlerts.reduce((sum, a) => sum + a.resources.length, 0);

  // Display summary
  const summaryLines = [
    `${pc.bold('Customer:')} ${customer.name}`,
    `${pc.bold('Grafana Folder:')} ${customer.grafanaFolder}`,
    `${pc.bold('Default Contact Point:')} ${customer.defaultContactPoint}`,
    '',
    `${pc.bold('Alert Rules:')} ${pendingAlerts.length}`,
    `${pc.bold('Resources Covered:')} ${totalResources}`,
    '',
    `${pc.red('Critical:')} ${bySeverity.critical}`,
    `${pc.yellow('Warning:')} ${bySeverity.warning}`,
    `${pc.blue('Info:')} ${bySeverity.info}`,
  ];

  p.note(summaryLines.join('\n'), 'Provisioning Summary');

  // Display alerts by service
  for (const [service, alerts] of byService) {
    const serviceLines: string[] = [];
    const serviceResources = alerts.reduce((sum, a) => sum + a.resources.length, 0);

    for (const alert of alerts.slice(0, 10)) {
      const severityColor = getSeverityColor(alert.configuration.severity);
      serviceLines.push(
        `${severityColor(alert.configuration.severity.toUpperCase().padEnd(8))} ${alert.template.name}`
      );
      serviceLines.push(
        `         ${pc.dim(`Covers: ${alert.resources.length} resources`)}`
      );
      serviceLines.push(
        `         ${pc.dim(`Threshold: ${alert.configuration.threshold}, Interval: ${alert.configuration.evaluationInterval}`)}`
      );
    }

    if (alerts.length > 10) {
      serviceLines.push(`... and ${alerts.length - 10} more alert rules`);
    }

    p.note(serviceLines.join('\n'), `${service.toUpperCase()} (${alerts.length} rules, ${serviceResources} resources)`);
  }

  // Warnings (adjusted for new model - fewer rules expected)
  const warnings: string[] = [];

  if (pendingAlerts.length > 200) {
    warnings.push(
      `⚠️  High alert rule count (${pendingAlerts.length}). Consider reducing templates.`
    );
  }

  if (bySeverity.critical > 50) {
    warnings.push(
      `⚠️  Many critical alerts (${bySeverity.critical}). This may cause alert fatigue.`
    );
  }

  if (warnings.length > 0) {
    p.log.warn(warnings.join('\n'));
  }

  // Final confirmation
  const confirmed = await p.confirm({
    message: `Generate provisioning script for ${pendingAlerts.length} alert rules covering ${totalResources} resources?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed)) {
    return { confirmed: false };
  }

  return { confirmed };
}

function getSeverityColor(severity: string): (text: string) => string {
  switch (severity) {
    case 'critical':
      return pc.red;
    case 'warning':
      return pc.yellow;
    case 'info':
      return pc.blue;
    default:
      return pc.white;
  }
}
