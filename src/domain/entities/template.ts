import type { AwsServiceType } from './aws-resource.js';
import type { DataSourceConfig } from '../value-objects/data-source-ref.js';
import type { ThresholdOperator } from '../value-objects/threshold.js';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface TemplateDefaults {
  readonly threshold: number;
  readonly thresholdOperator: ThresholdOperator;
  readonly evaluationInterval: string;
  readonly forDuration: string;
}

export interface TemplateAnnotations {
  readonly summary: string;
  readonly description: string;
  readonly runbook_url?: string;
}

export interface AlertTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly service: AwsServiceType;
  readonly severity: AlertSeverity;
  readonly dataSources: {
    readonly cloudwatch?: DataSourceConfig;
    readonly prometheus?: DataSourceConfig;
  };
  readonly defaults: TemplateDefaults;
  readonly labels: Readonly<Record<string, string>>;
  readonly annotations: TemplateAnnotations;
  readonly customizable: readonly CustomizableField[];
}

export type CustomizableField =
  | 'threshold'
  | 'evaluation_interval'
  | 'for_duration'
  | 'labels'
  | 'contact_point'
  | 'severity';

export interface MatchedResource {
  readonly id: string;
  readonly name: string;
  readonly arn: string;
  readonly region: string;
}

export interface TemplateMatch {
  readonly template: AlertTemplate;
  readonly resources: readonly MatchedResource[];
  readonly region: string;
}

export function isCustomizable(template: AlertTemplate, field: CustomizableField): boolean {
  return template.customizable.includes(field);
}

export function getTemplateDataSourceTypes(template: AlertTemplate): ('cloudwatch' | 'prometheus')[] {
  const types: ('cloudwatch' | 'prometheus')[] = [];
  if (template.dataSources.cloudwatch) {
    types.push('cloudwatch');
  }
  if (template.dataSources.prometheus) {
    types.push('prometheus');
  }
  return types;
}
