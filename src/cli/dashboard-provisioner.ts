#!/usr/bin/env bun
/**
 * Dashboard Provisioner TUI
 *
 * Interactive workflow for deploying Grafana dashboards to customers
 * who already have alerts deployed. Parses existing alert scripts to
 * detect services and generates matching dashboard deployment scripts.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import {
  loadAllDeployments,
  formatServiceCount,
  getSortedServices,
  type CustomerDeployment,
  type ServiceInfo,
} from '../utils/extract-customer-resources.js';
import {
  getDashboardTemplate,
  type DashboardTemplate,
} from '../config/dashboard-service-map.js';
import {
  createDashboardScriptGenerator,
  type DashboardConfig,
} from '../adapters/outbound/codegen/dashboard-script-generator.js';

// Paths
const DEPLOYMENTS_PATH = join(import.meta.dir, '../../docs/deployments');
const TEMPLATES_PATH = join(import.meta.dir, '../../dashboards/templates');

interface DashboardSelection {
  service: string;
  template: DashboardTemplate;
  selected: boolean;
  hasTemplate: boolean;
}

type WorkflowStep = 'customer' | 'grafana' | 'detection' | 'selection' | 'preview' | 'generate' | 'done';

interface WorkflowState {
  deployment?: CustomerDeployment;
  grafanaUrl?: string;
  datasourceUid?: string;
  defaultRegion?: string;
  services?: ServiceInfo[];
  dashboardSelections?: DashboardSelection[];
}

// ============================================================================
// Load environment
// ============================================================================

function loadEnv(): void {
  const envPaths = [
    join(DEPLOYMENTS_PATH, '.env'),
    join(import.meta.dir, '../../.env'),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const { readFileSync } = require('node:fs');
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

// ============================================================================
// Main workflow
// ============================================================================

async function main(): Promise<void> {
  loadEnv();

  p.intro(pc.bgCyan(pc.black(' Grafana Dashboard Provisioner ')));

  p.note(
    [
      `${pc.cyan('Purpose:')} Deploy dashboards for customers with existing alerts`,
      '',
      `${pc.cyan('Workflow:')}`,
      `  1. Select customer from existing deployments`,
      `  2. Configure Grafana connection`,
      `  3. Detect services from alert script`,
      `  4. Select dashboards to deploy`,
      `  5. Preview and generate deployment script`,
      '',
      `${pc.cyan('Navigation:')}`,
      `  ${pc.bold('Ctrl+C')} - Cancel current step`,
    ].join('\n'),
    'Dashboard Provisioner'
  );

  // Workflow state machine
  let currentStep: WorkflowStep = 'customer';
  const state: WorkflowState = {};

  const stepOrder: WorkflowStep[] = ['customer', 'grafana', 'detection', 'selection', 'preview', 'generate'];

  const getPreviousStep = (current: WorkflowStep): WorkflowStep => {
    const idx = stepOrder.indexOf(current);
    return idx > 0 ? stepOrder[idx - 1] ?? 'customer' : 'customer';
  };

  while (currentStep !== 'done') {
    switch (currentStep) {
      case 'customer': {
        const result = await runCustomerSelection();
        if (!result.confirmed) {
          const action = await askRetryOrExit('Customer selection');
          if (action === 'exit') {
            p.outro(pc.yellow('Workflow cancelled'));
            process.exit(0);
          }
        } else {
          state.deployment = result.deployment;
          currentStep = 'grafana';
        }
        break;
      }

      case 'grafana': {
        const result = await runGrafanaSetup(state.deployment!);
        if (!result.confirmed) {
          const action = await askRetryBackOrExit('Grafana setup');
          if (action === 'exit') {
            p.outro(pc.yellow('Workflow cancelled'));
            process.exit(0);
          } else if (action === 'back') {
            currentStep = getPreviousStep('grafana');
          }
        } else {
          state.grafanaUrl = result.grafanaUrl;
          state.datasourceUid = result.datasourceUid;
          state.defaultRegion = result.defaultRegion;
          currentStep = 'detection';
        }
        break;
      }

      case 'detection': {
        const result = await runServiceDetection(state.deployment!);
        if (!result.confirmed) {
          const action = await askRetryBackOrExit('Service detection');
          if (action === 'exit') {
            p.outro(pc.yellow('Workflow cancelled'));
            process.exit(0);
          } else if (action === 'back') {
            currentStep = getPreviousStep('detection');
          }
        } else {
          state.services = result.services;
          currentStep = 'selection';
        }
        break;
      }

      case 'selection': {
        const result = await runDashboardSelection(state.services!);
        if (!result.confirmed) {
          const action = await askRetryBackOrExit('Dashboard selection');
          if (action === 'exit') {
            p.outro(pc.yellow('Workflow cancelled'));
            process.exit(0);
          } else if (action === 'back') {
            currentStep = getPreviousStep('selection');
          }
        } else {
          state.dashboardSelections = result.selections;
          currentStep = 'preview';
        }
        break;
      }

      case 'preview': {
        const result = await runPreview(state);
        if (!result.confirmed) {
          const action = await askRetryBackOrExit('Preview');
          if (action === 'exit') {
            p.outro(pc.yellow('Workflow cancelled'));
            process.exit(0);
          } else if (action === 'back') {
            currentStep = getPreviousStep('preview');
          }
        } else {
          currentStep = 'generate';
        }
        break;
      }

      case 'generate': {
        await runScriptGeneration(state);
        currentStep = 'done';
        break;
      }
    }
  }
}

// ============================================================================
// Step 1: Customer Selection
// ============================================================================

interface CustomerSelectionResult {
  deployment?: CustomerDeployment;
  confirmed: boolean;
}

async function runCustomerSelection(): Promise<CustomerSelectionResult> {
  p.log.step(pc.cyan('Step 1: Customer Selection'));

  // Load all deployments
  const deployments = loadAllDeployments(DEPLOYMENTS_PATH);

  if (deployments.length === 0) {
    p.log.error(pc.red('No customer deployments found in docs/deployments/'));
    p.note(
      [
        'Run the alert provisioner first to create alert deployments:',
        `  ${pc.dim('bun run start')}`,
      ].join('\n'),
      'No Deployments Found'
    );
    return { confirmed: false };
  }

  // Create options for selection
  const options = deployments.map(d => ({
    value: d.deploymentDir,
    label: `${d.customer} (${formatServiceCount(d.services)})`,
    hint: d.folderPath,
  }));

  const selected = await p.select({
    message: 'Select customer deployment:',
    options,
  });

  if (p.isCancel(selected)) {
    return { confirmed: false };
  }

  const deployment = deployments.find(d => d.deploymentDir === selected);
  if (!deployment) {
    return { confirmed: false };
  }

  // Show deployment details
  const services = getSortedServices(deployment.services);
  p.note(
    [
      `${pc.bold('Customer:')} ${deployment.customer}`,
      `${pc.bold('Folder:')} ${deployment.folderPath}`,
      `${pc.bold('Datasource:')} ${deployment.datasourceUid}`,
      `${pc.bold('Regions:')} ${deployment.regions.join(', ')}`,
      `${pc.bold('Alerts:')} ${deployment.alertCount}`,
      '',
      `${pc.bold('Services with alerts:')}`,
      ...services.map(s => `  - ${s.service.toUpperCase()} (${s.alertCount} alerts)`),
    ].join('\n'),
    'Selected Deployment'
  );

  const confirmed = await p.confirm({
    message: 'Continue with this deployment?',
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    return { confirmed: false };
  }

  return { deployment, confirmed: true };
}

// ============================================================================
// Step 2: Grafana Connection
// ============================================================================

interface GrafanaSetupResult {
  grafanaUrl: string;
  datasourceUid: string;
  defaultRegion: string;
  confirmed: boolean;
}

async function runGrafanaSetup(deployment: CustomerDeployment): Promise<GrafanaSetupResult> {
  p.log.step(pc.cyan('Step 2: Grafana Connection'));

  // Get Grafana URL from env or prompt
  let grafanaUrl = process.env.GRAFANA_URL ?? '';
  const apiKey = process.env.GRAFANA_API_KEY ?? '';

  if (!grafanaUrl) {
    const urlInput = await p.text({
      message: 'Grafana URL:',
      placeholder: 'https://grafana.example.com',
      validate: value => {
        if (!value) return 'URL is required';
        try {
          new URL(value);
          return undefined;
        } catch {
          return 'Invalid URL format';
        }
      },
    });

    if (p.isCancel(urlInput)) {
      return { grafanaUrl: '', datasourceUid: '', defaultRegion: '', confirmed: false };
    }

    grafanaUrl = urlInput;
  }

  // Test connection if API key exists
  if (apiKey) {
    const spinner = p.spinner();
    spinner.start('Testing Grafana connection...');

    try {
      const response = await fetch(`${grafanaUrl}/api/health`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (response.ok) {
        spinner.stop(pc.green('Connected to Grafana'));
      } else {
        spinner.stop(pc.yellow('Connection test failed - will need API key at deploy time'));
      }
    } catch {
      spinner.stop(pc.yellow('Connection test failed - will need API key at deploy time'));
    }
  } else {
    p.log.warn(pc.yellow('No GRAFANA_API_KEY in environment - script will require it at runtime'));
  }

  // Use datasource UID from deployment
  const datasourceUid = deployment.datasourceUid;
  p.log.info(`Using datasource UID from alert script: ${pc.cyan(datasourceUid)}`);

  // Select default region
  const defaultRegion = deployment.regions[0] ?? 'us-east-1';

  const regionInput = await p.select({
    message: 'Default region for dashboards:',
    options: deployment.regions.map(r => ({ value: r, label: r })),
    initialValue: defaultRegion,
  });

  if (p.isCancel(regionInput)) {
    return { grafanaUrl: '', datasourceUid: '', defaultRegion: '', confirmed: false };
  }

  return {
    grafanaUrl,
    datasourceUid,
    defaultRegion: regionInput,
    confirmed: true,
  };
}

// ============================================================================
// Step 3: Service Detection
// ============================================================================

interface ServiceDetectionResult {
  services: ServiceInfo[];
  confirmed: boolean;
}

async function runServiceDetection(deployment: CustomerDeployment): Promise<ServiceDetectionResult> {
  p.log.step(pc.cyan('Step 3: Resource Detection'));

  const services = getSortedServices(deployment.services);

  // Build display showing detected services
  const lines: string[] = [];

  for (const service of services) {
    const template = getDashboardTemplate(service.service);
    const status = template
      ? pc.green('✓ Dashboard available')
      : pc.yellow('⚠ No dashboard template');

    lines.push(`${pc.bold(service.service.toUpperCase())} (${service.regions.join(', ')})`);
    lines.push(`  ${status}`);
    lines.push(`  ${pc.dim(`${service.alertCount} alerts in ${service.ruleGroup}`)}`);
    lines.push('');
  }

  p.note(lines.join('\n'), 'Detected Services from Alert Script');

  const confirmed = await p.confirm({
    message: 'Proceed to dashboard selection?',
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    return { services: [], confirmed: false };
  }

  return { services, confirmed: true };
}

// ============================================================================
// Step 4: Dashboard Selection
// ============================================================================

interface DashboardSelectionResult {
  selections: DashboardSelection[];
  confirmed: boolean;
}

async function runDashboardSelection(services: ServiceInfo[]): Promise<DashboardSelectionResult> {
  p.log.step(pc.cyan('Step 4: Dashboard Selection'));

  // Build selection options
  const selections: DashboardSelection[] = [];
  const selectableOptions: Array<{ value: string; label: string; hint?: string }> = [];
  const gaps: string[] = [];

  for (const service of services) {
    const template = getDashboardTemplate(service.service);

    if (template) {
      selections.push({
        service: service.service,
        template,
        selected: true, // Pre-select all available dashboards
        hasTemplate: true,
      });

      selectableOptions.push({
        value: service.service,
        label: `${template.title} (matches ${service.service.toUpperCase()})`,
        hint: template.filename,
      });
    } else {
      selections.push({
        service: service.service,
        template: null as unknown as DashboardTemplate,
        selected: false,
        hasTemplate: false,
      });
      gaps.push(service.service.toUpperCase());
    }
  }

  if (selectableOptions.length === 0) {
    p.log.error(pc.red('No dashboard templates available for detected services'));
    return { selections: [], confirmed: false };
  }

  // Show gaps if any
  if (gaps.length > 0) {
    p.log.warn(pc.yellow(`No dashboard templates for: ${gaps.join(', ')}`));
  }

  // Multi-select dashboards
  const selected = await p.multiselect({
    message: 'Select dashboards to deploy:',
    options: selectableOptions,
    initialValues: selectableOptions.map(o => o.value), // Pre-select all
    required: true,
  });

  if (p.isCancel(selected)) {
    return { selections: [], confirmed: false };
  }

  // Update selections based on user choice
  for (const sel of selections) {
    sel.selected = selected.includes(sel.service);
  }

  const selectedCount = selections.filter(s => s.selected).length;
  p.log.info(`Selected ${selectedCount} dashboard(s) for deployment`);

  return { selections, confirmed: true };
}

// ============================================================================
// Step 5: Preview
// ============================================================================

interface PreviewResult {
  confirmed: boolean;
}

async function runPreview(state: WorkflowState): Promise<PreviewResult> {
  p.log.step(pc.cyan('Step 5: Preview'));

  const selectedDashboards = state.dashboardSelections!.filter(s => s.selected && s.hasTemplate);

  const lines: string[] = [
    `${pc.bold('Customer:')} ${state.deployment!.customer}`,
    `${pc.bold('Folder:')} ${state.deployment!.folderPath}`,
    `${pc.bold('Grafana URL:')} ${state.grafanaUrl}`,
    `${pc.bold('Datasource UID:')} ${state.datasourceUid}`,
    `${pc.bold('Default Region:')} ${state.defaultRegion}`,
    '',
    `${pc.bold('Dashboards to deploy:')}`,
  ];

  for (const dash of selectedDashboards) {
    const title = `${state.deployment!.customer} - ${dash.template.title}`;
    lines.push(`  ${pc.green('•')} ${title}`);
    lines.push(`    ${pc.dim(`Template: ${dash.template.filename}`)}`);
  }

  const gaps = state.dashboardSelections!.filter(s => !s.hasTemplate);
  if (gaps.length > 0) {
    lines.push('');
    lines.push(`${pc.yellow('⚠ Services without dashboards:')}`);
    for (const gap of gaps) {
      lines.push(`  ${pc.yellow('•')} ${gap.service.toUpperCase()}`);
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

// ============================================================================
// Step 6: Script Generation
// ============================================================================

async function runScriptGeneration(state: WorkflowState): Promise<void> {
  p.log.step(pc.cyan('Step 6: Script Generation'));

  const spinner = p.spinner();
  spinner.start('Generating dashboard deployment script...');

  const selectedDashboards = state.dashboardSelections!.filter(s => s.selected && s.hasTemplate);

  // Build dashboard configs
  const dashboardConfigs: DashboardConfig[] = selectedDashboards.map(dash => ({
    service: dash.service,
    template: dash.template,
    templatePath: join(TEMPLATES_PATH, dash.template.filename),
    title: `${state.deployment!.customer} - ${dash.template.title}`,
  }));

  // Generate script
  const generator = createDashboardScriptGenerator(TEMPLATES_PATH);
  const script = await generator.generateScript({
    customer: state.deployment!.customer,
    folderPath: state.deployment!.folderPath,
    grafanaUrl: state.grafanaUrl!,
    datasourceUid: state.datasourceUid!,
    defaultRegion: state.defaultRegion!,
    dashboards: dashboardConfigs,
  });

  // Write to deployment directory
  const outputDir = join(DEPLOYMENTS_PATH, state.deployment!.deploymentDir);
  const outputPath = await generator.writeScript(script, outputDir);

  spinner.stop(pc.green(`Generated: ${script.filename}`));

  p.note(
    [
      `${pc.bold('Script:')} ${outputPath}`,
      `${pc.bold('Dashboards:')} ${script.dashboardCount}`,
      '',
      `${pc.cyan('To deploy:')}`,
      `  cd ${outputDir}`,
      `  GRAFANA_API_KEY=xxx bun run ${script.filename}`,
      '',
      `${pc.cyan('To delete dashboards:')}`,
      `  GRAFANA_API_KEY=xxx bun run ${script.filename} --delete`,
    ].join('\n'),
    'Script Generated'
  );

  p.outro(pc.green('Dashboard provisioning complete!'));
}

// ============================================================================
// Navigation helpers
// ============================================================================

async function askRetryOrExit(stepName: string): Promise<'retry' | 'exit'> {
  const action = await p.select({
    message: `${stepName} was cancelled. What would you like to do?`,
    options: [
      { value: 'retry', label: 'Retry this step', hint: 'Try again' },
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
      { value: 'retry', label: 'Retry this step', hint: 'Try again' },
      { value: 'back', label: 'Go back one step', hint: 'Return to previous step' },
      { value: 'exit', label: 'Exit workflow' },
    ],
  });

  if (p.isCancel(action)) {
    return 'exit';
  }

  return action as 'retry' | 'back' | 'exit';
}

// Run
main().catch(error => {
  console.error(pc.red('Fatal error:'), error);
  process.exit(1);
});
