import type { Customer } from '../../domain/entities/customer.js';
import type { DiscoveredResources } from '../../domain/entities/aws-resource.js';
import type { TemplateMatch, AlertTemplate } from '../../domain/entities/template.js';
import type { AlertRule, PendingAlert } from '../../domain/entities/alert.js';
import type { GeneratedScript } from '../outbound/script-generator-port.js';
import type { GrafanaContactPoint, GrafanaDataSource } from '../outbound/grafana-port.js';

export interface CustomerSetupResult {
  readonly customer: Customer;
  readonly confirmed: boolean;
}

export interface AwsDiscoveryResult {
  readonly resources: DiscoveredResources;
  readonly regions: readonly string[];
  readonly confirmed: boolean;
}

export interface TemplateMatchingResult {
  readonly matches: readonly TemplateMatch[];
  readonly confirmed: boolean;
}

export interface AlertCustomizationResult {
  readonly pendingAlerts: readonly PendingAlert[];
  readonly confirmed: boolean;
}

export interface PreviewResult {
  readonly alerts: readonly AlertRule[];
  readonly confirmed: boolean;
}

export interface ScriptGenerationResult {
  readonly script: GeneratedScript;
  readonly outputPath: string;
}

export interface WorkflowContext {
  readonly contactPoints: readonly GrafanaContactPoint[];
  readonly dataSources: readonly GrafanaDataSource[];
  readonly templates: readonly AlertTemplate[];
  readonly grafanaUrl: string;
}

export interface WorkflowPort {
  initialize(): Promise<void>;

  runCustomerSetup(): Promise<CustomerSetupResult>;

  runAwsDiscovery(regions: readonly string[]): Promise<AwsDiscoveryResult>;

  runTemplateMatching(
    resources: DiscoveredResources,
    templates: readonly AlertTemplate[]
  ): Promise<TemplateMatchingResult>;

  runAlertCustomization(
    matches: readonly TemplateMatch[],
    customer: Customer,
    context: WorkflowContext
  ): Promise<AlertCustomizationResult>;

  runPreview(
    pendingAlerts: readonly PendingAlert[],
    customer: Customer,
    dataSources: readonly GrafanaDataSource[]
  ): Promise<PreviewResult>;

  runScriptGeneration(
    alerts: readonly AlertRule[],
    customer: Customer,
    grafanaUrl: string
  ): Promise<ScriptGenerationResult>;

  showError(error: Error): void;

  showSuccess(message: string): void;

  confirm(message: string): Promise<boolean>;
}
