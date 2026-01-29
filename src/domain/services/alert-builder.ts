import type {
  AlertRule,
  AlertConfiguration,
  PendingAlert,
  CloudWatchQuery,
  PrometheusQuery,
} from '../entities/alert.js';
import type { AwsServiceType } from '../entities/aws-resource.js';
import type { AlertTemplate, TemplateMatch, MatchedResource } from '../entities/template.js';
import type { Customer } from '../entities/customer.js';
import type { DataSourceRef } from '../value-objects/data-source-ref.js';
import { createThreshold } from '../value-objects/threshold.js';
import { createAlertId, createAlertTitle } from '../entities/alert.js';

export interface AlertBuilderDependencies {
  readonly dataSourceRef: DataSourceRef;
}

/**
 * Mapping of AWS service types to their CloudWatch dimension key.
 * This is the dimension used to identify individual resources.
 */
const SERVICE_DIMENSION_MAP: Record<AwsServiceType, string> = {
  ec2: 'InstanceId',
  rds: 'DBInstanceIdentifier',
  lambda: 'FunctionName',
  ecs: 'ServiceName',
  eks: 'ClusterName',
  elasticache: 'CacheClusterId',
  alb: 'LoadBalancer',
  nlb: 'LoadBalancer',
  apigateway: 'ApiName',
  s3: 'BucketName',
  sqs: 'QueueName',
};

export class AlertBuilder {
  buildAlert(
    pendingAlert: PendingAlert,
    customer: Customer,
    dataSourceRef: DataSourceRef
  ): AlertRule {
    const { template, resources, configuration, region } = pendingAlert;

    const query = this.buildQuery(template, resources, configuration, region);
    const labels = this.buildLabels(template, configuration, customer);
    const annotations = this.buildAnnotations(template);

    // Include region in title to differentiate multi-region alerts
    const regionSuffix = customer.regions.length > 1 ? ` (${region})` : '';

    // Rule group is per-service (e.g., "EC2-Alerts", "RDS-Alerts")
    const serviceUpper = template.service.toUpperCase();
    const ruleGroup = `${serviceUpper}-Alerts`;

    return {
      id: createAlertId(`${template.id}-${region}`),
      title: createAlertTitle(`${template.name}${regionSuffix}`),
      description: template.description,
      folderUid: '', // Will be set when folder is created
      ruleGroup,
      severity: configuration.severity,
      threshold: createThreshold(configuration.threshold, template.defaults.thresholdOperator),
      evaluationInterval: configuration.evaluationInterval,
      forDuration: configuration.forDuration,
      dataSource: dataSourceRef,
      query,
      labels,
      annotations,
      contactPoint: configuration.contactPoint,
      sourceTemplate: template,
      coveredResources: resources,
    };
  }

  buildAlertsFromPending(
    pendingAlerts: readonly PendingAlert[],
    customer: Customer,
    dataSourceRef: DataSourceRef
  ): readonly AlertRule[] {
    return pendingAlerts.map(pending =>
      this.buildAlert(pending, customer, dataSourceRef)
    );
  }

  createDefaultConfiguration(
    template: AlertTemplate,
    customer: Customer
  ): AlertConfiguration {
    return {
      threshold: template.defaults.threshold,
      evaluationInterval: template.defaults.evaluationInterval,
      forDuration: template.defaults.forDuration,
      severity: template.severity,
      labels: { ...template.labels },
      contactPoint: customer.defaultContactPoint,
      dataSourceType: template.dataSources.cloudwatch ? 'cloudwatch' : 'prometheus',
      dataSourceUid: '', // Set during customization when user selects data source
      dataSourceName: '', // Set during customization when user selects data source
    };
  }

  createPendingAlert(
    match: TemplateMatch,
    customer: Customer
  ): PendingAlert {
    return {
      template: match.template,
      resources: match.resources,
      configuration: this.createDefaultConfiguration(match.template, customer),
      region: match.region,
    };
  }

  private buildQuery(
    template: AlertTemplate,
    resources: readonly MatchedResource[],
    configuration: AlertConfiguration,
    region: string
  ): CloudWatchQuery | PrometheusQuery {
    if (configuration.dataSourceType === 'cloudwatch' && template.dataSources.cloudwatch) {
      const cwConfig = template.dataSources.cloudwatch;
      if (cwConfig.type !== 'cloudwatch') {
        throw new Error('Invalid CloudWatch config');
      }

      const dimensionKey = this.getDimensionKey(template.service, cwConfig.dimensions);
      // Use wildcard to monitor ALL resources of this type, not specific instances
      // This makes alerts more robust as new resources are automatically covered
      const dimensionValues = ['*'];

      return {
        type: 'cloudwatch',
        namespace: cwConfig.namespace,
        metricName: cwConfig.metric,
        statistic: cwConfig.statistic,
        dimensionKey,
        dimensionValues,
        period: cwConfig.period ?? 300,
        region,
      };
    }

    if (configuration.dataSourceType === 'prometheus' && template.dataSources.prometheus) {
      const promConfig = template.dataSources.prometheus;
      if (promConfig.type !== 'prometheus') {
        throw new Error('Invalid Prometheus config');
      }

      // For Prometheus, use regex matching for multiple resources
      const resourceNames = resources.map(r => r.name);
      const expr = this.interpolatePrometheusQuery(promConfig.query, resourceNames);

      return {
        type: 'prometheus',
        expr,
        legendFormat: '{{instance}}',
      };
    }

    throw new Error(`No valid data source configuration for template ${template.id}`);
  }

  private getDimensionKey(service: AwsServiceType, dimensions: readonly string[]): string {
    // Use the first dimension from the template, or fall back to service default
    if (dimensions.length > 0) {
      return dimensions[0]!;
    }
    return SERVICE_DIMENSION_MAP[service] ?? 'Name';
  }

  private interpolatePrometheusQuery(query: string, resourceNames: readonly string[]): string {
    // Build regex pattern for multiple resources
    const pattern = resourceNames.join('|');
    return query
      .replace(/\{\{\s*\$resource_pattern\s*\}\}/g, pattern)
      .replace(/\{\{\s*\$resource_name\s*\}\}/g, pattern);
  }

  private buildLabels(
    template: AlertTemplate,
    configuration: AlertConfiguration,
    customer: Customer
  ): Readonly<Record<string, string>> {
    const labels: Record<string, string> = {
      ...template.labels,
      ...configuration.labels,
      customer: customer.name,
      service: template.service,
      severity: configuration.severity,
    };

    if (customer.labels) {
      Object.assign(labels, customer.labels);
    }

    return Object.freeze(labels);
  }

  private buildAnnotations(
    template: AlertTemplate
  ): Readonly<Record<string, string>> {
    // Annotations use Grafana template variables for dynamic resource info
    // {{ $labels.FunctionName }} will be populated per-series at alert time
    const annotations: Record<string, string> = {
      summary: template.annotations.summary,
      description: template.annotations.description,
    };

    if (template.annotations.runbook_url) {
      annotations['runbook_url'] = template.annotations.runbook_url;
    }

    return Object.freeze(annotations);
  }
}

export function createAlertBuilder(): AlertBuilder {
  return new AlertBuilder();
}
