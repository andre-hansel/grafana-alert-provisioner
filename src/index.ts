#!/usr/bin/env bun
/**
 * Grafana Provisioner
 *
 * A TUI application that discovers customer AWS infrastructure and generates
 * reviewable TypeScript scripts to provision Grafana alerts and/or dashboards.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs/promises';
import { join } from 'path';

import { loadConfig, validateConfig } from './config/index.js';
import { createAwsDiscoveryAdapter } from './adapters/outbound/aws/index.js';
import { createYamlTemplateRepository } from './adapters/outbound/filesystem/index.js';
import { createGrafanaApiAdapter } from './adapters/outbound/grafana/index.js';
import { createTypeScriptScriptGenerator } from './adapters/outbound/codegen/index.js';
import { createTuiWorkflow } from './adapters/inbound/cli/index.js';
import { createDashboardWorkflow } from './adapters/inbound/cli/dashboard-workflow.js';
import { runGrafanaSetupPrompt } from './adapters/inbound/cli/prompts/index.js';
import { runCloudWatchValidation } from './adapters/inbound/cli/prompts/cloudwatch-validation.js';
import type { DiscoveredResources } from './domain/entities/aws-resource.js';
import { generateValidationReport, type ValidationSummary, type AlertSelectionSummary } from './domain/services/cloudwatch-validator.js';
import { generateDashboardReport } from './domain/services/dashboard-report-generator.js';
import type { Customer } from './domain/entities/customer.js';
import type { TemplateMatch, AlertTemplate } from './domain/entities/template.js';
import type { PendingAlert, AlertRule } from './domain/entities/alert.js';
import type { GrafanaContactPoint, GrafanaDataSource } from './ports/outbound/grafana-port.js';
import type {
  DashboardMatchingResult,
  DashboardSelection,
} from './domain/entities/dashboard.js';

type ProvisioningMode = 'dashboards' | 'alerts' | 'both';

type WorkflowStep =
  | 'mode'
  | 'customer'
  | 'grafana'
  | 'discovery'
  | 'validation'
  // Dashboard steps
  | 'dashboard-matching'
  | 'dashboard-selection'
  | 'dashboard-preview'
  | 'dashboard-generate'
  // Alert steps
  | 'matching'
  | 'customization'
  | 'preview'
  | 'generate'
  | 'done';

interface WorkflowState {
  mode?: ProvisioningMode;
  customer?: Customer;
  grafanaUrl?: string;
  dataSources?: GrafanaDataSource[];
  contactPoints?: readonly GrafanaContactPoint[];
  resources?: DiscoveredResources;
  validatedResources?: DiscoveredResources;
  validationSummary?: ValidationSummary;
  templates?: readonly AlertTemplate[];
  // Dashboard state
  dashboardMatchingResult?: DashboardMatchingResult;
  dashboardSelections?: readonly DashboardSelection[];
  dashboardGaps?: readonly string[];
  // Alert state
  matches?: readonly TemplateMatch[];
  alertSelectionSummary?: AlertSelectionSummary;
  pendingAlerts?: readonly PendingAlert[];
  alerts?: readonly AlertRule[];
}

async function main(): Promise<void> {
  // Parse command line args for mode shortcut
  const args = process.argv.slice(2);
  let initialMode: ProvisioningMode | undefined;
  if (args.includes('--mode=dashboards')) {
    initialMode = 'dashboards';
  } else if (args.includes('--mode=alerts')) {
    initialMode = 'alerts';
  } else if (args.includes('--mode=both')) {
    initialMode = 'both';
  }

  // Load and validate configuration
  let config = loadConfig();
  const configErrors = validateConfig(config);

  if (configErrors.length > 0) {
    console.error(pc.red('Configuration errors:'));
    for (const error of configErrors) {
      console.error(pc.red(`  - ${error}`));
    }
    process.exit(1);
  }

  // Create adapters
  const awsDiscovery = createAwsDiscoveryAdapter();
  const templateRepository = createYamlTemplateRepository(config.templatesPath);
  let grafana = createGrafanaApiAdapter({
    url: config.grafanaUrl,
    apiKey: config.grafanaApiKey,
  });
  const scriptGenerator = createTypeScriptScriptGenerator(config.outputPath);

  // Create workflows
  const alertWorkflow = createTuiWorkflow({
    awsDiscovery,
    grafana,
    scriptGenerator,
  });

  const dashboardWorkflow = createDashboardWorkflow({
    outputPath: config.outputPath,
  });

  // Workflow state machine
  let currentStep: WorkflowStep = initialMode ? 'customer' : 'mode';
  const state: WorkflowState = { mode: initialMode };

  try {
    console.clear();
    p.intro(pc.bgCyan(pc.black(' Grafana Provisioner ')));
    p.log.info('Discover AWS infrastructure and generate Grafana alert/dashboard provisioning scripts.');
    p.log.info('');

    // Show navigation help
    p.note(
      [
        `${pc.cyan('Navigation:')}`,
        `  ${pc.bold('Ctrl+C')} - Cancel current step (prompts to go back or exit)`,
        `  ${pc.bold('No')} at review - Go back and re-enter values`,
      ].join('\n'),
      'Controls'
    );

    // Helper to get previous step based on mode
    const getPreviousStep = (current: WorkflowStep, mode: ProvisioningMode): WorkflowStep => {
      const alertSteps: WorkflowStep[] = ['customer', 'grafana', 'discovery', 'validation', 'matching', 'customization', 'preview', 'generate'];
      const dashboardSteps: WorkflowStep[] = ['customer', 'grafana', 'discovery', 'dashboard-matching', 'dashboard-selection', 'dashboard-preview', 'dashboard-generate'];
      const bothSteps: WorkflowStep[] = ['customer', 'grafana', 'discovery', 'validation', 'dashboard-matching', 'dashboard-selection', 'dashboard-preview', 'dashboard-generate', 'matching', 'customization', 'preview', 'generate'];

      const stepOrder = mode === 'dashboards' ? dashboardSteps : mode === 'alerts' ? alertSteps : bothSteps;
      const idx = stepOrder.indexOf(current);
      return idx > 0 ? stepOrder[idx - 1] ?? 'customer' : 'customer';
    };

    while (currentStep !== 'done') {
      switch (currentStep) {
        case 'mode': {
          const modeResult = await p.select({
            message: 'What would you like to provision?',
            options: [
              { value: 'dashboards', label: 'Dashboards only', hint: 'Generate dashboard deployment scripts' },
              { value: 'alerts', label: 'Alerts only', hint: 'Generate alert provisioning scripts' },
              { value: 'both', label: 'Dashboards + Alerts', hint: 'Generate both dashboard and alert scripts' },
            ],
          });

          if (p.isCancel(modeResult)) {
            p.outro(pc.yellow('Workflow cancelled'));
            process.exit(0);
          }

          state.mode = modeResult as ProvisioningMode;
          currentStep = 'customer';
          break;
        }

        case 'customer': {
          const result = await alertWorkflow.runCustomerSetup();
          if (!result.confirmed) {
            const action = await askRetryOrExit('Customer setup');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            }
          } else {
            state.customer = result.customer;
            currentStep = 'grafana';
          }
          break;
        }

        case 'grafana': {
          const result = await runGrafanaSetupPrompt(
            grafana,
            config.grafanaUrl,
            config.grafanaApiKey
          );

          if (!result.confirmed) {
            const action = await askRetryBackOrExit('Grafana setup');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('grafana', state.mode!);
            }
          } else {
            state.grafanaUrl = result.grafanaUrl;
            state.dataSources = result.dataSources;
            state.contactPoints = result.contactPoints;

            if (result.grafanaUrl !== config.grafanaUrl) {
              config = { ...config, grafanaUrl: result.grafanaUrl };
              grafana = createGrafanaApiAdapter({
                url: result.grafanaUrl,
                apiKey: process.env.GRAFANA_API_KEY,
              });
            }

            currentStep = 'discovery';
          }
          break;
        }

        case 'discovery': {
          if (!state.customer) {
            currentStep = 'customer';
            break;
          }
          const result = await alertWorkflow.runAwsDiscovery(state.customer.regions);
          if (!result.confirmed) {
            const action = await askRetryBackOrExit('AWS Discovery');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('discovery', state.mode!);
            }
          } else {
            state.resources = result.resources;
            state.templates = await templateRepository.loadAllTemplates();

            // Route based on mode
            if (state.mode === 'dashboards') {
              currentStep = 'dashboard-matching';
            } else {
              // alerts or both - do validation first
              currentStep = 'validation';
            }
          }
          break;
        }

        case 'validation': {
          if (!state.resources || !state.customer || !state.dataSources || state.dataSources.length === 0) {
            currentStep = 'discovery';
            break;
          }

          const cwDataSource = state.dataSources.find(ds => ds.type === 'cloudwatch');
          if (!cwDataSource) {
            p.log.error(pc.red('No CloudWatch data source selected - skipping validation'));
            state.validatedResources = state.resources;
            // Route based on mode
            currentStep = state.mode === 'both' ? 'dashboard-matching' : 'matching';
            break;
          }

          const validationResult = await runCloudWatchValidation(
            grafana,
            grafana.toDataSourceRef(cwDataSource),
            state.resources,
            state.customer.regions,
            state.customer.name
          );

          if (!validationResult.confirmed) {
            const action = await askRetryBackOrExit('CloudWatch Validation');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('validation', state.mode!);
            }
          } else {
            state.validatedResources = validationResult.validatedResources;
            state.validationSummary = validationResult.summary;
            // Route based on mode
            currentStep = state.mode === 'both' ? 'dashboard-matching' : 'matching';
          }
          break;
        }

        // ==================== Dashboard Steps ====================

        case 'dashboard-matching': {
          const resourcesToMatch = state.validatedResources ?? state.resources;
          if (!resourcesToMatch) {
            currentStep = 'discovery';
            break;
          }

          const result = await dashboardWorkflow.runDashboardMatching(resourcesToMatch);
          if (!result.confirmed) {
            const action = await askRetryBackOrExit('Dashboard Matching');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('dashboard-matching', state.mode!);
            }
          } else {
            state.dashboardMatchingResult = result;
            state.dashboardGaps = result.gaps;
            currentStep = 'dashboard-selection';
          }
          break;
        }

        case 'dashboard-selection': {
          if (!state.dashboardMatchingResult) {
            currentStep = 'dashboard-matching';
            break;
          }

          const result = await dashboardWorkflow.runDashboardSelection(state.dashboardMatchingResult);
          if (!result.confirmed) {
            const action = await askRetryBackOrExit('Dashboard Selection');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('dashboard-selection', state.mode!);
            }
          } else {
            state.dashboardSelections = result.selectedDashboards;
            currentStep = 'dashboard-preview';
          }
          break;
        }

        case 'dashboard-preview': {
          if (!state.dashboardSelections || !state.customer || !state.dataSources || !state.grafanaUrl) {
            currentStep = 'dashboard-selection';
            break;
          }

          const result = await dashboardWorkflow.runDashboardPreview(
            state.dashboardSelections,
            {
              customer: state.customer,
              grafanaUrl: state.grafanaUrl,
              dataSources: state.dataSources,
              defaultRegion: state.customer.regions[0] ?? 'us-east-1',
            },
            state.dashboardGaps ?? []
          );

          if (!result.confirmed) {
            const action = await askRetryBackOrExit('Dashboard Preview');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('dashboard-preview', state.mode!);
            }
          } else {
            currentStep = 'dashboard-generate';
          }
          break;
        }

        case 'dashboard-generate': {
          if (!state.dashboardSelections || !state.customer || !state.dataSources || !state.grafanaUrl) {
            currentStep = 'dashboard-preview';
            break;
          }

          const cwDataSource = state.dataSources.find(ds => ds.type === 'cloudwatch');
          const datasourceUid = cwDataSource?.uid ?? 'cloudwatch';
          const defaultRegion = state.customer.regions[0] ?? 'us-east-1';

          await dashboardWorkflow.runDashboardScriptGeneration(
            state.dashboardSelections,
            {
              customer: state.customer,
              grafanaUrl: state.grafanaUrl,
              dataSources: state.dataSources,
              defaultRegion,
            }
          );

          // Generate dashboard deployment report
          if (state.dashboardMatchingResult) {
            const saveReport = await p.confirm({
              message: 'Save dashboard deployment report?',
              initialValue: true,
            });

            if (!p.isCancel(saveReport) && saveReport) {
              const now = new Date();
              const dateStr = now.toISOString().split('T')[0];
              const safeCustomerName = state.customer.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
              const reportFilename = `${safeCustomerName}-dashboard-report-${dateStr}.md`;
              const reportPath = join(config.outputPath, reportFilename);

              const report = generateDashboardReport({
                customerName: state.customer.name,
                folderPath: state.customer.grafanaFolder,
                matches: state.dashboardMatchingResult.matches,
                gaps: state.dashboardGaps ?? [],
                selections: state.dashboardSelections,
                grafanaUrl: state.grafanaUrl,
                datasourceUid,
                defaultRegion,
              });

              try {
                await fs.mkdir(config.outputPath, { recursive: true });
                await fs.writeFile(reportPath, report, 'utf-8');
                p.log.success(`Dashboard report saved to ${reportPath}`);
              } catch (error) {
                p.log.error(`Failed to save report: ${error}`);
              }
            }
          }

          // Route based on mode
          if (state.mode === 'both') {
            p.log.info('');
            p.log.info(pc.cyan('Dashboard script generated. Continuing to alerts...'));
            p.log.info('');
            currentStep = 'matching';
          } else {
            p.outro(pc.green('Dashboard provisioning complete!'));
            currentStep = 'done';
          }
          break;
        }

        // ==================== Alert Steps ====================

        case 'matching': {
          const resourcesToMatch = state.validatedResources ?? state.resources;
          if (!resourcesToMatch || !state.templates) {
            currentStep = 'validation';
            break;
          }
          const result = await alertWorkflow.runTemplateMatching(resourcesToMatch, state.templates);
          if (!result.confirmed) {
            const action = await askRetryBackOrExit('Template Matching');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('matching', state.mode!);
            }
          } else {
            state.matches = result.matches;
            state.alertSelectionSummary = result.alertSelectionSummary;
            currentStep = 'customization';
          }
          break;
        }

        case 'customization': {
          if (!state.matches || !state.customer || !state.templates || !state.dataSources || state.dataSources.length === 0) {
            currentStep = 'matching';
            break;
          }
          const result = await alertWorkflow.runAlertCustomization(
            state.matches,
            state.customer,
            {
              contactPoints: state.contactPoints ?? [],
              dataSources: state.dataSources,
              templates: state.templates,
              grafanaUrl: state.grafanaUrl ?? config.grafanaUrl,
            }
          );
          if (!result.confirmed) {
            const action = await askRetryBackOrExit('Alert Customization');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('customization', state.mode!);
            }
          } else {
            state.pendingAlerts = result.pendingAlerts;
            currentStep = 'preview';
          }
          break;
        }

        case 'preview': {
          if (!state.pendingAlerts || !state.customer || !state.dataSources || state.dataSources.length === 0) {
            currentStep = 'customization';
            break;
          }
          const result = await alertWorkflow.runPreview(
            state.pendingAlerts,
            state.customer,
            state.dataSources
          );
          if (!result.confirmed) {
            const action = await askRetryBackOrExit('Preview');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('preview', state.mode!);
            }
          } else {
            state.alerts = result.alerts;
            currentStep = 'generate';
          }
          break;
        }

        case 'generate': {
          if (!state.alerts || !state.customer) {
            currentStep = 'preview';
            break;
          }
          const scriptResult = await alertWorkflow.runScriptGeneration(
            state.alerts,
            state.customer,
            state.grafanaUrl ?? config.grafanaUrl
          );

          // Generate complete validation report with alert tracking
          if (state.validationSummary && state.alertSelectionSummary) {
            const saveReport = await p.confirm({
              message: 'Save complete validation report (includes resource exclusions and alert tracking)?',
              initialValue: true,
            });

            if (!p.isCancel(saveReport) && saveReport) {
              const now = new Date();
              const dateStr = now.toISOString().split('T')[0];
              const safeCustomerName = state.customer.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
              const reportFilename = `${safeCustomerName}-validation-${dateStr}.md`;
              const reportPath = join(config.outputPath, reportFilename);
              const report = generateValidationReport(
                state.validationSummary,
                state.customer.name,
                state.alertSelectionSummary
              );
              try {
                await fs.mkdir(config.outputPath, { recursive: true });
                await fs.writeFile(reportPath, report, 'utf-8');
                p.log.success(`Validation report saved to ${reportPath}`);
              } catch (error) {
                p.log.error(`Failed to save report: ${error}`);
              }
            }
          }

          console.log('');
          p.outro(pc.green(`Successfully generated: ${scriptResult.outputPath}`));
          currentStep = 'done';
          break;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      alertWorkflow.showError(error);
    } else {
      console.error(pc.red('An unexpected error occurred'));
    }
    process.exit(1);
  }
}

async function askRetryOrExit(stepName: string): Promise<'retry' | 'exit'> {
  const action = await p.select({
    message: `${stepName} was cancelled. What would you like to do?`,
    options: [
      { value: 'retry', label: 'Retry this step', hint: 'Try again with same/different input' },
      { value: 'exit', label: 'Exit workflow' },
    ],
  });

  if (p.isCancel(action)) {
    return 'exit';
  }

  return action as 'retry' | 'exit';
}

async function askRetryBackOrExit(stepName: string): Promise<'retry' | 'back' | 'exit'> {
  const action = await p.select({
    message: `${stepName} was cancelled. What would you like to do?`,
    options: [
      { value: 'retry', label: 'Retry this step', hint: 'Try again with same/different input' },
      { value: 'back', label: 'Go back one step', hint: 'Return to previous step' },
      { value: 'exit', label: 'Exit workflow' },
    ],
  });

  if (p.isCancel(action)) {
    return 'exit';
  }

  return action as 'retry' | 'back' | 'exit';
}

main();
