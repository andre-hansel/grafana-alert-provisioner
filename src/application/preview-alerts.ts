import type { PendingAlert, AlertRule } from '../domain/entities/alert.js';
import type { Customer } from '../domain/entities/customer.js';
import type { GrafanaPort } from '../ports/outbound/grafana-port.js';
import type { DataSourceRef, DataSourceType } from '../domain/value-objects/data-source-ref.js';
import { createAlertBuilder } from '../domain/services/alert-builder.js';
import { countAlertsBySeverity, groupAlertsByService } from '../domain/entities/alert.js';

export interface PreviewAlertsInput {
  pendingAlerts: readonly PendingAlert[];
  customer: Customer;
}

export interface PreviewAlertsOutput {
  alerts: readonly AlertRule[];
  summary: AlertsSummary;
}

export interface AlertsSummary {
  totalCount: number;
  byService: Map<string, number>;
  bySeverity: { critical: number; warning: number; info: number };
  warnings: string[];
}

export class PreviewAlertsUseCase {
  constructor(private grafana: GrafanaPort) {}

  async execute(input: PreviewAlertsInput): Promise<PreviewAlertsOutput> {
    const { pendingAlerts, customer } = input;

    const builder = createAlertBuilder();
    const alerts: AlertRule[] = [];

    // Get data sources from Grafana
    const dataSources = await this.grafana.listDataSources();
    const dataSourcesByType = new Map<DataSourceType, DataSourceRef>();

    for (const ds of dataSources) {
      const ref = this.grafana.toDataSourceRef(ds);
      if (!dataSourcesByType.has(ref.type)) {
        dataSourcesByType.set(ref.type, ref);
      }
    }

    // Build alert rules
    for (const pending of pendingAlerts) {
      const dsType = pending.configuration.dataSourceType;
      const dataSourceRef = dataSourcesByType.get(dsType);

      if (!dataSourceRef) {
        console.warn(`No ${dsType} data source available, skipping alert`);
        continue;
      }

      const alert = builder.buildAlert(pending, customer, dataSourceRef);
      alerts.push(alert);
    }

    // Generate summary
    const summary = this.generateSummary(alerts);

    return { alerts, summary };
  }

  private generateSummary(alerts: readonly AlertRule[]): AlertsSummary {
    const byService = groupAlertsByService(alerts);
    const bySeverity = countAlertsBySeverity(alerts);
    const warnings: string[] = [];

    // Generate warnings
    if (alerts.length > 100) {
      warnings.push(
        `High alert count (${alerts.length}). Consider splitting into multiple provisioning runs.`
      );
    }

    if (bySeverity.critical > 20) {
      warnings.push(
        `Many critical alerts (${bySeverity.critical}). This may cause alert fatigue.`
      );
    }

    const serviceCountMap = new Map<string, number>();
    for (const [service, serviceAlerts] of byService) {
      serviceCountMap.set(service, serviceAlerts.length);
    }

    return {
      totalCount: alerts.length,
      byService: serviceCountMap,
      bySeverity,
      warnings,
    };
  }
}

export function createPreviewAlertsUseCase(grafana: GrafanaPort): PreviewAlertsUseCase {
  return new PreviewAlertsUseCase(grafana);
}
