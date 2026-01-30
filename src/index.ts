#!/usr/bin/env bun
/**
 * Grafana Alert Provisioner
 *
 * A TUI application that discovers customer AWS infrastructure and generates
 * a reviewable TypeScript script to provision matching Grafana alerts.
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
import { runGrafanaSetupPrompt } from './adapters/inbound/cli/prompts/index.js';
import { runCloudWatchValidation } from './adapters/inbound/cli/prompts/cloudwatch-validation.js';
import type { DiscoveredResources } from './domain/entities/aws-resource.js';
import { generateValidationReport, type ValidationSummary, type AlertSelectionSummary } from './domain/services/cloudwatch-validator.js';
import type { Customer } from './domain/entities/customer.js';
import type { TemplateMatch, AlertTemplate } from './domain/entities/template.js';
import type { PendingAlert, AlertRule } from './domain/entities/alert.js';
import type { GrafanaContactPoint, GrafanaDataSource } from './ports/outbound/grafana-port.js';

type WorkflowStep = 'customer' | 'grafana' | 'discovery' | 'validation' | 'matching' | 'customization' | 'preview' | 'generate' | 'done';

interface WorkflowState {
  customer?: Customer;
  grafanaUrl?: string;
  dataSources?: GrafanaDataSource[];
  contactPoints?: readonly GrafanaContactPoint[];
  resources?: DiscoveredResources;
  validatedResources?: DiscoveredResources;
  validationSummary?: ValidationSummary;
  templates?: readonly AlertTemplate[];
  matches?: readonly TemplateMatch[];
  alertSelectionSummary?: AlertSelectionSummary;
  pendingAlerts?: readonly PendingAlert[];
  alerts?: readonly AlertRule[];
}

async function main(): Promise<void> {
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

  // Create TUI workflow
  const workflow = createTuiWorkflow({
    awsDiscovery,
    grafana,
    scriptGenerator,
  });

  // Workflow state machine
  let currentStep: WorkflowStep = 'customer';
  const state: WorkflowState = {};

  try {
    await workflow.initialize();

    // Show navigation help
    p.note(
      [
        `${pc.cyan('Navigation:')}`,
        `  ${pc.bold('Ctrl+C')} - Cancel current step (prompts to go back or exit)`,
        `  ${pc.bold('No')} at review - Go back and re-enter values`,
      ].join('\n'),
      'Controls'
    );

    // Step order for navigation
    const stepOrder: WorkflowStep[] = ['customer', 'grafana', 'discovery', 'validation', 'matching', 'customization', 'preview', 'generate'];

    const getPreviousStep = (current: WorkflowStep): WorkflowStep => {
      const idx = stepOrder.indexOf(current);
      return idx > 0 ? stepOrder[idx - 1] ?? 'customer' : 'customer';
    };

    while (currentStep !== 'done') {
      switch (currentStep) {
        case 'customer': {
          const result = await workflow.runCustomerSetup();
          if (!result.confirmed) {
            // First step - no "go back" option since there's nowhere to go
            const action = await askRetryOrExit('Customer setup');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            }
            // 'retry' stays on customer
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
              currentStep = getPreviousStep('grafana');
            }
            // 'retry' stays on grafana
          } else {
            state.grafanaUrl = result.grafanaUrl;
            state.dataSources = result.dataSources;
            state.contactPoints = result.contactPoints;

            // Update grafana adapter if URL/key changed
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
          const result = await workflow.runAwsDiscovery(state.customer.regions);
          if (!result.confirmed) {
            const action = await askRetryBackOrExit('AWS Discovery');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('discovery');
            }
            // 'retry' stays on discovery
          } else {
            state.resources = result.resources;
            state.templates = await templateRepository.loadAllTemplates();
            currentStep = 'validation';
          }
          break;
        }

        case 'validation': {
          if (!state.resources || !state.customer || !state.dataSources || state.dataSources.length === 0) {
            currentStep = 'discovery';
            break;
          }

          // Find the CloudWatch data source
          const cwDataSource = state.dataSources.find(ds => ds.type === 'cloudwatch');
          if (!cwDataSource) {
            p.log.error(pc.red('No CloudWatch data source selected - skipping validation'));
            state.validatedResources = state.resources;
            currentStep = 'matching';
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
              currentStep = getPreviousStep('validation');
            }
            // 'retry' stays on validation
          } else {
            state.validatedResources = validationResult.validatedResources;
            state.validationSummary = validationResult.summary;
            currentStep = 'matching';
          }
          break;
        }

        case 'matching': {
          // Use validated resources if available, otherwise fall back to raw resources
          const resourcesToMatch = state.validatedResources ?? state.resources;
          if (!resourcesToMatch || !state.templates) {
            currentStep = 'validation';
            break;
          }
          const result = await workflow.runTemplateMatching(resourcesToMatch, state.templates);
          if (!result.confirmed) {
            const action = await askRetryBackOrExit('Template Matching');
            if (action === 'exit') {
              p.outro(pc.yellow('Workflow cancelled'));
              process.exit(0);
            } else if (action === 'back') {
              currentStep = getPreviousStep('matching');
            }
            // 'retry' stays on matching
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
          const result = await workflow.runAlertCustomization(
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
              currentStep = getPreviousStep('customization');
            }
            // 'retry' stays on customization
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
          const result = await workflow.runPreview(
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
              currentStep = getPreviousStep('preview');
            }
            // 'retry' stays on preview
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
          const scriptResult = await workflow.runScriptGeneration(
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
              const dateStr = now.toISOString().split('T')[0]; // 2024-01-29
              const safeCustomerName = state.customer.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
              const reportFilename = `${safeCustomerName}-validation-${dateStr}.md`;
              const reportPath = join(config.outputPath, reportFilename);
              const report = generateValidationReport(
                state.validationSummary,
                state.customer.name,
                state.alertSelectionSummary
              );
              try {
                // Ensure output directory exists
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
      workflow.showError(error);
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
