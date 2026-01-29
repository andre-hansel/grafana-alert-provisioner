import type { AlertSeverity, AlertTemplate, MatchedResource } from './template.js';
import type { AwsServiceType } from './aws-resource.js';
import type { DataSourceRef, DataSourceType } from '../value-objects/data-source-ref.js';
import type { Threshold } from '../value-objects/threshold.js';

/**
 * Alert rule using multi-dimensional alerting.
 * One rule per template, covers all resources of that service type.
 * Grafana evaluates each time series independently.
 */
export interface AlertRule {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly folderUid: string;
  readonly ruleGroup: string;
  readonly severity: AlertSeverity;
  readonly threshold: Threshold;
  readonly evaluationInterval: string;
  readonly forDuration: string;
  readonly dataSource: DataSourceRef;
  readonly query: AlertQuery;
  readonly labels: Readonly<Record<string, string>>;
  readonly annotations: Readonly<Record<string, string>>;
  readonly contactPoint: string;
  readonly sourceTemplate: AlertTemplate;
  readonly coveredResources: readonly MatchedResource[];
}

/**
 * CloudWatch query using dimension wildcards for multi-dimensional alerting.
 * The dimensionKey tells Grafana which dimension to use for grouping.
 */
export interface CloudWatchQuery {
  readonly type: 'cloudwatch';
  readonly namespace: string;
  readonly metricName: string;
  readonly statistic: string;
  readonly dimensionKey: string;  // e.g., 'FunctionName', 'InstanceId'
  readonly dimensionValues: readonly string[];  // Specific values or ['*'] for all
  readonly period: number;
  readonly region: string;
}

export interface PrometheusQuery {
  readonly type: 'prometheus';
  readonly expr: string;
  readonly legendFormat?: string;
}

export type AlertQuery = CloudWatchQuery | PrometheusQuery;

export interface AlertConfiguration {
  readonly threshold: number;
  readonly evaluationInterval: string;
  readonly forDuration: string;
  readonly severity: AlertSeverity;
  readonly labels: Record<string, string>;
  readonly contactPoint: string;
  readonly dataSourceType: DataSourceType;
  readonly dataSourceUid: string;
  readonly dataSourceName: string;
}

/**
 * Pending alert - one per (template, region) combination.
 * Resources list is informational - the actual query covers all via wildcards.
 * Region is required because CloudWatch queries are region-specific.
 */
export interface PendingAlert {
  readonly template: AlertTemplate;
  readonly resources: readonly MatchedResource[];
  readonly configuration: AlertConfiguration;
  readonly region: string;
}

export function createAlertId(templateId: string): string {
  return templateId;
}

export function createAlertTitle(templateName: string): string {
  return templateName;
}

export function groupAlertsByService(alerts: readonly AlertRule[]): Map<AwsServiceType, AlertRule[]> {
  const grouped = new Map<AwsServiceType, AlertRule[]>();

  for (const alert of alerts) {
    const service = alert.sourceTemplate.service;
    const existing = grouped.get(service) ?? [];
    grouped.set(service, [...existing, alert]);
  }

  return grouped;
}

export function countAlertsBySeverity(alerts: readonly AlertRule[]): Record<AlertSeverity, number> {
  const counts: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 0,
    info: 0,
  };

  for (const alert of alerts) {
    counts[alert.severity]++;
  }

  return counts;
}
