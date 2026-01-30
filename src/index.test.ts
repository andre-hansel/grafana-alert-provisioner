/**
 * Entry Point Import Tests
 *
 * Verifies all modules can be imported and the workflow types are correct.
 */

import { describe, test, expect } from 'bun:test';

describe('Module Imports', () => {
  test('can import dashboard domain entities', async () => {
    const mod = await import('./domain/entities/dashboard.js');

    // Verify types are exported (they exist as undefined at runtime for type-only exports)
    expect(mod).toBeDefined();
  });

  test('can import dashboard matcher', async () => {
    const mod = await import('./domain/services/dashboard-matcher.js');

    expect(mod.matchDashboardTemplates).toBeDefined();
    expect(typeof mod.matchDashboardTemplates).toBe('function');

    expect(mod.groupMatchesByService).toBeDefined();
    expect(typeof mod.groupMatchesByService).toBe('function');

    expect(mod.aggregateToSelections).toBeDefined();
    expect(typeof mod.aggregateToSelections).toBe('function');
  });

  test('can import dashboard workflow', async () => {
    const mod = await import('./adapters/inbound/cli/dashboard-workflow.js');

    expect(mod.createDashboardWorkflow).toBeDefined();
    expect(typeof mod.createDashboardWorkflow).toBe('function');
    expect(mod.DashboardTuiWorkflow).toBeDefined();
  });

  test('can import dashboard prompts', async () => {
    const mod = await import('./adapters/inbound/cli/prompts/index.js');

    expect(mod.runDashboardSelectionPrompt).toBeDefined();
    expect(typeof mod.runDashboardSelectionPrompt).toBe('function');

    expect(mod.runDashboardPreviewPrompt).toBeDefined();
    expect(typeof mod.runDashboardPreviewPrompt).toBe('function');
  });

  test('can import dashboard service map', async () => {
    const mod = await import('./config/dashboard-service-map.js');

    expect(mod.DASHBOARD_SERVICE_MAP).toBeDefined();
    expect(mod.getDashboardTemplate).toBeDefined();
    expect(mod.getAllDashboardTemplates).toBeDefined();

    // Verify some expected services have templates
    expect(mod.DASHBOARD_SERVICE_MAP['ec2']).toBeDefined();
    expect(mod.DASHBOARD_SERVICE_MAP['rds']).toBeDefined();
    expect(mod.DASHBOARD_SERVICE_MAP['lambda']).toBeDefined();
    expect(mod.DASHBOARD_SERVICE_MAP['alb']).toBeDefined();
    expect(mod.DASHBOARD_SERVICE_MAP['aurora']).toBeDefined();
  });

  test('dashboard service map has correct structure', async () => {
    const { DASHBOARD_SERVICE_MAP } = await import('./config/dashboard-service-map.js');

    const ec2Template = DASHBOARD_SERVICE_MAP['ec2'];
    expect(ec2Template).toBeDefined();
    expect(ec2Template?.filename).toBe('ec2-cloudwatch-dashboard.json');
    expect(ec2Template?.title).toBe('EC2 Dashboard');
    expect(ec2Template?.namespace).toBe('AWS/EC2');
    expect(ec2Template?.dimensionKey).toBe('InstanceId');
    expect(ec2Template?.variableName).toBe('instance_id');
  });
});

describe('Workflow Integration', () => {
  test('createDashboardWorkflow returns workflow with expected methods', async () => {
    const { createDashboardWorkflow } = await import('./adapters/inbound/cli/dashboard-workflow.js');

    const workflow = createDashboardWorkflow({
      outputPath: '/tmp/test',
    });

    expect(workflow.runDashboardMatching).toBeDefined();
    expect(workflow.runDashboardSelection).toBeDefined();
    expect(workflow.runDashboardPreview).toBeDefined();
    expect(workflow.runDashboardScriptGeneration).toBeDefined();
  });
});
