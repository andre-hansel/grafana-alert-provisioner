import * as p from '@clack/prompts';
import pc from 'picocolors';
import type {
  WorkflowPort,
  CustomerSetupResult,
  AwsDiscoveryResult,
  TemplateMatchingResult,
  AlertCustomizationResult,
  PreviewResult,
  ScriptGenerationResult,
  WorkflowContext,
} from '../../../ports/inbound/workflow-port.js';
import type { Customer } from '../../../domain/entities/customer.js';
import { US_REGIONS } from '../../../domain/entities/customer.js';
import type { DiscoveredResources } from '../../../domain/entities/aws-resource.js';
import type { AlertTemplate, TemplateMatch } from '../../../domain/entities/template.js';
import type { AlertRule, PendingAlert } from '../../../domain/entities/alert.js';
import type { AwsDiscoveryPort } from '../../../ports/outbound/aws-discovery-port.js';
import type { GrafanaPort, GrafanaDataSource } from '../../../ports/outbound/grafana-port.js';
import type { ScriptGeneratorPort } from '../../../ports/outbound/script-generator-port.js';
import type { DataSourceRef } from '../../../domain/value-objects/data-source-ref.js';
import { createAlertBuilder } from '../../../domain/services/alert-builder.js';

import {
  runCustomerSetupPrompt,
  runAwsDiscoveryPrompt,
  runTemplateMatchingPrompt,
  runAlertCustomizationPrompt,
  runPreviewPrompt,
  runScriptGenerationPrompt,
} from './prompts/index.js';

export interface TuiWorkflowDependencies {
  awsDiscovery: AwsDiscoveryPort;
  grafana: GrafanaPort;
  scriptGenerator: ScriptGeneratorPort;
}

export class TuiWorkflow implements WorkflowPort {
  private deps: TuiWorkflowDependencies;

  constructor(deps: TuiWorkflowDependencies) {
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    console.clear();
    p.intro(pc.bgCyan(pc.black(' Grafana Alert Provisioner ')));
    p.log.info('This tool discovers AWS infrastructure and generates Grafana alert provisioning scripts.');
    p.log.info('');
  }

  async runCustomerSetup(): Promise<CustomerSetupResult> {
    const [contactPoints, folders] = await Promise.all([
      this.deps.grafana.listContactPoints().catch(() => []),
      this.deps.grafana.listFolders().catch(() => []),
    ]);

    const result = await runCustomerSetupPrompt({
      contactPoints,
      folders,
      defaultRegions: [...US_REGIONS],
    });

    return result;
  }

  async runAwsDiscovery(regions: readonly string[]): Promise<AwsDiscoveryResult> {
    return await runAwsDiscoveryPrompt(this.deps.awsDiscovery, regions);
  }

  async runTemplateMatching(
    resources: DiscoveredResources,
    templates: readonly AlertTemplate[]
  ): Promise<TemplateMatchingResult> {
    return await runTemplateMatchingPrompt(resources, templates);
  }

  async runAlertCustomization(
    matches: readonly TemplateMatch[],
    customer: Customer,
    context: WorkflowContext
  ): Promise<AlertCustomizationResult> {
    return await runAlertCustomizationPrompt({
      matches,
      customer,
      contactPoints: context.contactPoints,
      dataSources: context.dataSources,
    });
  }

  async runPreview(
    pendingAlerts: readonly PendingAlert[],
    customer: Customer,
    dataSources: GrafanaDataSource[]
  ): Promise<PreviewResult> {
    const previewResult = await runPreviewPrompt(pendingAlerts, customer);

    if (!previewResult.confirmed) {
      return { alerts: [], confirmed: false };
    }

    // Build actual alert rules from pending alerts
    const builder = createAlertBuilder();
    const alerts: AlertRule[] = [];

    for (const pending of pendingAlerts) {
      // Find the data source by UID (stored during customization)
      const dataSource = dataSources.find(ds => ds.uid === pending.configuration.dataSourceUid);

      if (!dataSource) {
        // Fall back to first available data source
        const fallbackDs = dataSources[0];
        if (!fallbackDs) {
          p.log.warn(`No data source available, skipping alert for ${pending.template.name}`);
          continue;
        }

        const fallbackType = fallbackDs.type.toLowerCase() === 'cloudwatch' ? 'cloudwatch' : 'prometheus';
        const dataSourceRef: DataSourceRef = {
          uid: fallbackDs.uid,
          type: fallbackType as 'cloudwatch' | 'prometheus',
          name: fallbackDs.name,
        };

        const alert = builder.buildAlert(pending, customer, dataSourceRef);
        alerts.push(alert);
      } else {
        const dsType = dataSource.type.toLowerCase() === 'cloudwatch' ? 'cloudwatch' : 'prometheus';
        const dataSourceRef: DataSourceRef = {
          uid: dataSource.uid,
          type: dsType as 'cloudwatch' | 'prometheus',
          name: dataSource.name,
        };

        const alert = builder.buildAlert(pending, customer, dataSourceRef);
        alerts.push(alert);
      }
    }

    return { alerts, confirmed: true };
  }

  async runScriptGeneration(
    alerts: readonly AlertRule[],
    customer: Customer,
    grafanaUrl: string
  ): Promise<ScriptGenerationResult> {
    const result = await runScriptGenerationPrompt(
      alerts,
      customer,
      grafanaUrl,
      this.deps.scriptGenerator
    );

    if (!result) {
      throw new Error('Script generation cancelled');
    }

    return result;
  }

  showError(error: Error): void {
    p.log.error(pc.red(`Error: ${error.message}`));
    if (process.env['DEBUG']) {
      console.error(error.stack);
    }
  }

  showSuccess(message: string): void {
    p.log.success(pc.green(message));
  }

  async confirm(message: string): Promise<boolean> {
    const result = await p.confirm({
      message,
      initialValue: true,
    });

    return !p.isCancel(result) && result;
  }
}

export function createTuiWorkflow(deps: TuiWorkflowDependencies): WorkflowPort {
  return new TuiWorkflow(deps);
}
