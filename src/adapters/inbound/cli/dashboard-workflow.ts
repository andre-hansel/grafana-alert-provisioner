/**
 * Dashboard TUI Workflow
 *
 * Handles the dashboard provisioning workflow steps.
 * Designed to work standalone or integrated with the alert workflow.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DiscoveredResources } from '../../../domain/entities/aws-resource.js';
import type { Customer } from '../../../domain/entities/customer.js';
import type {
  DashboardMatchingResult,
  DashboardSelectionResult,
  DashboardPreviewResult,
  DashboardScriptGenerationResult,
  DashboardSelection,
} from '../../../domain/entities/dashboard.js';
import type { GrafanaDataSource } from '../../../ports/outbound/grafana-port.js';
import { matchDashboardTemplates } from '../../../domain/services/dashboard-matcher.js';
import { runDashboardSelectionPrompt } from './prompts/dashboard-selection.js';
import { runDashboardPreviewPrompt } from './prompts/dashboard-preview.js';
import {
  createDashboardScriptGenerator,
  type DashboardConfig,
} from '../../outbound/codegen/dashboard-script-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_TEMPLATES_PATH = join(__dirname, '../../../../dashboards/templates');

export interface DashboardWorkflowDependencies {
  /** Output path for generated scripts */
  outputPath: string;
}

export interface DashboardWorkflowContext {
  customer: Customer;
  grafanaUrl: string;
  dataSources: GrafanaDataSource[];
  defaultRegion: string;
}

export class DashboardTuiWorkflow {
  private deps: DashboardWorkflowDependencies;

  constructor(deps: DashboardWorkflowDependencies) {
    this.deps = deps;
  }

  /**
   * Run dashboard matching against discovered resources.
   */
  async runDashboardMatching(resources: DiscoveredResources): Promise<DashboardMatchingResult> {
    p.log.step(pc.cyan('Dashboard Matching'));

    const spinner = p.spinner();
    spinner.start('Matching resources to dashboard templates...');

    const result = matchDashboardTemplates({ resources });

    spinner.stop(`Found ${result.matches.length} dashboard template match(es)`);

    if (result.matches.length === 0) {
      p.log.warn(pc.yellow('No dashboard templates match discovered resources'));
      return {
        matches: [],
        gaps: result.gaps,
        confirmed: false,
      };
    }

    // Show summary of matches
    const services = [...new Set(result.matches.map(m => m.service))];
    p.log.info(`Services with dashboards: ${services.map(s => s.toUpperCase()).join(', ')}`);

    if (result.gaps.length > 0) {
      p.log.warn(pc.yellow(`No templates for: ${result.gaps.join(', ')}`));
    }

    return {
      matches: result.matches,
      gaps: result.gaps,
      confirmed: true,
    };
  }

  /**
   * Run dashboard selection prompt.
   */
  async runDashboardSelection(
    matchingResult: DashboardMatchingResult
  ): Promise<DashboardSelectionResult> {
    return await runDashboardSelectionPrompt({
      matches: matchingResult.matches,
      gaps: matchingResult.gaps,
    });
  }

  /**
   * Run dashboard preview prompt.
   */
  async runDashboardPreview(
    selections: readonly DashboardSelection[],
    context: DashboardWorkflowContext,
    gaps: readonly string[]
  ): Promise<DashboardPreviewResult> {
    // Find CloudWatch datasource
    const cwDataSource = context.dataSources.find(ds => ds.type === 'cloudwatch');
    const datasourceUid = cwDataSource?.uid ?? 'cloudwatch';

    return await runDashboardPreviewPrompt({
      customer: context.customer,
      grafanaUrl: context.grafanaUrl,
      datasourceUid,
      defaultRegion: context.defaultRegion,
      selectedDashboards: selections.filter(s => s.selected && s.hasTemplate),
      gaps,
    });
  }

  /**
   * Run dashboard script generation.
   */
  async runDashboardScriptGeneration(
    selections: readonly DashboardSelection[],
    context: DashboardWorkflowContext
  ): Promise<DashboardScriptGenerationResult> {
    p.log.step(pc.cyan('Dashboard Script Generation'));

    const spinner = p.spinner();
    spinner.start('Generating dashboard deployment script...');

    const selectedDashboards = selections.filter(s => s.selected && s.hasTemplate);

    // Find CloudWatch datasource
    const cwDataSource = context.dataSources.find(ds => ds.type === 'cloudwatch');
    const datasourceUid = cwDataSource?.uid ?? 'cloudwatch';

    // Build dashboard configs
    const dashboardConfigs: DashboardConfig[] = selectedDashboards.map(dash => ({
      service: dash.service,
      template: dash.template,
      templatePath: join(DASHBOARD_TEMPLATES_PATH, dash.template.filename),
      title: `${context.customer.name} - ${dash.template.title}`,
    }));

    // Generate script
    const generator = createDashboardScriptGenerator(DASHBOARD_TEMPLATES_PATH);
    const script = await generator.generateScript({
      customer: context.customer.name,
      folderPath: context.customer.grafanaFolder,
      grafanaUrl: context.grafanaUrl,
      datasourceUid,
      defaultRegion: context.defaultRegion,
      dashboards: dashboardConfigs,
    });

    // Write to output directory
    const outputPath = await generator.writeScript(script, this.deps.outputPath);

    spinner.stop(pc.green(`Generated: ${script.filename}`));

    p.note(
      [
        `${pc.bold('Script:')} ${outputPath}`,
        `${pc.bold('Dashboards:')} ${script.dashboardCount}`,
        '',
        `${pc.cyan('To deploy:')}`,
        `  cd ${this.deps.outputPath}`,
        `  GRAFANA_API_KEY=xxx bun run ${script.filename}`,
        '',
        `${pc.cyan('To delete dashboards:')}`,
        `  GRAFANA_API_KEY=xxx bun run ${script.filename} --delete`,
      ].join('\n'),
      'Script Generated'
    );

    return {
      outputPath,
      filename: script.filename,
      dashboardCount: script.dashboardCount,
    };
  }
}

export function createDashboardWorkflow(deps: DashboardWorkflowDependencies): DashboardTuiWorkflow {
  return new DashboardTuiWorkflow(deps);
}
