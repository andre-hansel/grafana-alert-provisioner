/**
 * Dashboard Workflow Tests
 *
 * Tests the dashboard workflow orchestration with mock data.
 * These tests verify the workflow logic without making live API calls.
 */

import { describe, test, expect } from 'bun:test';
import { createDashboardWorkflow } from './dashboard-workflow.js';
import type { DiscoveredResources } from '../../../domain/entities/aws-resource.js';
import { createEmptyDiscoveredResources } from '../../../domain/entities/aws-resource.js';

// Mock resources for testing
function createMockResources(): DiscoveredResources {
  const base = createEmptyDiscoveredResources();

  return {
    ...base,
    ec2: [
      {
        id: 'i-123',
        arn: 'arn:aws:ec2:us-east-1:123:instance/i-123',
        name: 'web-server-1',
        service: 'ec2',
        region: 'us-east-1',
        tags: [],
        instanceType: 't3.medium',
        state: 'running',
      },
    ],
    lambda: [
      {
        id: 'my-function',
        arn: 'arn:aws:lambda:us-east-1:123:function:my-function',
        name: 'my-function',
        service: 'lambda',
        region: 'us-east-1',
        tags: [],
        runtime: 'nodejs18.x',
        memorySize: 256,
        timeout: 30,
        handler: 'index.handler',
        lastModified: '2024-01-01',
        hasDlqConfigured: false,
        isEdgeFunction: false,
      },
    ],
  };
}

describe('DashboardWorkflow', () => {
  test('can be instantiated', () => {
    const workflow = createDashboardWorkflow({
      outputPath: '/tmp/test-output',
    });

    expect(workflow).toBeDefined();
  });

  test('runDashboardMatching returns matches for resources', async () => {
    const workflow = createDashboardWorkflow({
      outputPath: '/tmp/test-output',
    });

    const resources = createMockResources();

    // Note: This will call the matching logic but won't display prompts
    // because we're testing the pure logic portion
    const result = await workflow.runDashboardMatching(resources);

    // Should find matches for EC2 and Lambda
    expect(result.matches.length).toBe(2);
    expect(result.confirmed).toBe(true);

    const services = result.matches.map(m => m.service);
    expect(services).toContain('ec2');
    expect(services).toContain('lambda');
  });

  test('runDashboardMatching returns not confirmed for empty resources', async () => {
    const workflow = createDashboardWorkflow({
      outputPath: '/tmp/test-output',
    });

    const resources = createEmptyDiscoveredResources();
    const result = await workflow.runDashboardMatching(resources);

    expect(result.matches.length).toBe(0);
    expect(result.confirmed).toBe(false);
  });
});
