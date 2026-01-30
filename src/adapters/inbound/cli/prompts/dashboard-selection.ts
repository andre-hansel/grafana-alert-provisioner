/**
 * Dashboard Selection Prompt
 *
 * Displays detected services with available dashboard templates
 * and allows multi-selection of which dashboards to deploy.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { DashboardMatch, DashboardSelection, DashboardSelectionResult } from '../../../../domain/entities/dashboard.js';
import { groupMatchesByService, aggregateToSelections } from '../../../../domain/services/dashboard-matcher.js';

export interface DashboardSelectionOptions {
  /** Matches from dashboard matcher */
  matches: readonly DashboardMatch[];
  /** Services with resources but no templates */
  gaps: readonly string[];
}

/**
 * Run the dashboard selection prompt.
 * Shows detected services and allows multi-select of dashboards.
 */
export async function runDashboardSelectionPrompt(
  options: DashboardSelectionOptions
): Promise<DashboardSelectionResult> {
  const { matches, gaps } = options;

  p.log.step(pc.cyan('Dashboard Selection'));

  // Group matches by service for display
  const byService = groupMatchesByService(matches);
  const { selections: aggregated } = aggregateToSelections(matches, gaps);

  // Show detected services summary
  const summaryLines: string[] = [];
  for (const [service, serviceMatches] of byService) {
    const totalResources = serviceMatches.reduce((sum, m) => sum + m.resourceCount, 0);
    const regions = [...new Set(serviceMatches.map(m => m.region))];
    const template = serviceMatches[0]?.template;

    summaryLines.push(`${pc.bold(service.toUpperCase())} (${totalResources} resource${totalResources === 1 ? '' : 's'})`);
    summaryLines.push(`  ${pc.green('✓')} ${template?.title ?? 'Dashboard'}`);
    summaryLines.push(`  ${pc.dim(`Regions: ${regions.join(', ')}`)}`);
    summaryLines.push('');
  }

  // Show gaps (services without templates)
  if (gaps.length > 0) {
    summaryLines.push(pc.yellow('Services without dashboard templates:'));
    for (const gap of gaps) {
      summaryLines.push(`  ${pc.yellow('⚠')} ${gap.toUpperCase()}`);
    }
  }

  p.note(summaryLines.join('\n'), 'Detected Services');

  // Build selection options
  const selectableOptions: Array<{ value: string; label: string; hint?: string }> = [];

  for (const [service, data] of aggregated) {
    if (data.hasTemplate && data.template) {
      selectableOptions.push({
        value: service,
        label: `${data.template.title} (${service.toUpperCase()})`,
        hint: `${data.totalResourceCount} resource${data.totalResourceCount === 1 ? '' : 's'} in ${data.regions.join(', ')}`,
      });
    }
  }

  if (selectableOptions.length === 0) {
    p.log.error(pc.red('No dashboard templates available for detected services'));
    return {
      selections: [],
      selectedDashboards: [],
      confirmed: false,
    };
  }

  // Multi-select dashboards
  const selected = await p.multiselect({
    message: 'Select dashboards to deploy:',
    options: selectableOptions,
    initialValues: selectableOptions.map(o => o.value), // Pre-select all
    required: true,
  });

  if (p.isCancel(selected)) {
    return {
      selections: [],
      selectedDashboards: [],
      confirmed: false,
    };
  }

  const selectedSet = new Set(selected);

  // Build final selections
  const selections: DashboardSelection[] = [];
  for (const [service, data] of aggregated) {
    selections.push({
      service,
      template: data.template!,
      selected: selectedSet.has(service),
      hasTemplate: data.hasTemplate,
      regions: data.regions,
      totalResourceCount: data.totalResourceCount,
    });
  }

  const selectedDashboards = selections.filter(s => s.selected && s.hasTemplate);

  p.log.info(`Selected ${selectedDashboards.length} dashboard(s) for deployment`);

  return {
    selections,
    selectedDashboards,
    confirmed: true,
  };
}
