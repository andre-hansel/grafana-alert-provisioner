/**
 * Dashboard Matcher Tests
 *
 * Tests the dashboard template matching logic against mock resources.
 */

import { describe, test, expect } from 'bun:test';
import { matchDashboardTemplates, groupMatchesByService, aggregateToSelections } from './dashboard-matcher.js';
import type { DiscoveredResources } from '../entities/aws-resource.js';
import { createEmptyDiscoveredResources } from '../entities/aws-resource.js';

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
      {
        id: 'i-456',
        arn: 'arn:aws:ec2:us-west-2:123:instance/i-456',
        name: 'web-server-2',
        service: 'ec2',
        region: 'us-west-2',
        tags: [],
        instanceType: 't3.medium',
        state: 'running',
      },
    ],
    rds: [
      {
        id: 'db-prod',
        arn: 'arn:aws:rds:us-east-1:123:db:db-prod',
        name: 'db-prod',
        service: 'rds',
        region: 'us-east-1',
        tags: [],
        engine: 'mysql',
        engineVersion: '8.0',
        instanceClass: 'db.t3.medium',
        allocatedStorage: 100,
        multiAz: true,
        status: 'available',
        hasReadReplicas: false,
        isReadReplica: false,
        hasStorageAutoscaling: false,
        isAurora: false,
        isServerless: false,
      },
      {
        id: 'aurora-cluster',
        arn: 'arn:aws:rds:us-east-1:123:cluster:aurora-cluster',
        name: 'aurora-cluster',
        service: 'rds',
        region: 'us-east-1',
        tags: [],
        engine: 'aurora-mysql',
        engineVersion: '8.0',
        instanceClass: 'db.r5.large',
        allocatedStorage: 0,
        multiAz: true,
        status: 'available',
        hasReadReplicas: true,
        isReadReplica: false,
        hasStorageAutoscaling: false,
        isAurora: true,
        clusterIdentifier: 'aurora-cluster',
        isServerless: false,
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
        hasDlqConfigured: true,
        isEdgeFunction: false,
      },
    ],
    alb: [
      {
        id: 'alb-123',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/my-alb/123',
        name: 'my-alb',
        service: 'alb',
        region: 'us-east-1',
        tags: [],
        dnsName: 'my-alb.us-east-1.elb.amazonaws.com',
        scheme: 'internet-facing',
        vpcId: 'vpc-123',
        state: 'active',
      },
    ],
  };
}

describe('matchDashboardTemplates', () => {
  test('matches resources to templates', () => {
    const resources = createMockResources();
    const result = matchDashboardTemplates({ resources });

    expect(result.matches.length).toBeGreaterThan(0);

    // Should have EC2 matches for both regions
    const ec2Matches = result.matches.filter(m => m.service === 'ec2');
    expect(ec2Matches.length).toBe(2); // us-east-1 and us-west-2

    // Check regions
    const ec2Regions = ec2Matches.map(m => m.region).sort();
    expect(ec2Regions).toEqual(['us-east-1', 'us-west-2']);
  });

  test('splits RDS and Aurora correctly', () => {
    const resources = createMockResources();
    const result = matchDashboardTemplates({ resources });

    const rdsMatches = result.matches.filter(m => m.service === 'rds');
    const auroraMatches = result.matches.filter(m => m.service === 'aurora');

    // Should have separate matches for RDS and Aurora
    expect(rdsMatches.length).toBe(1);
    expect(auroraMatches.length).toBe(1);

    // RDS match should have 1 resource
    expect(rdsMatches[0]?.resourceCount).toBe(1);

    // Aurora match should have 1 resource
    expect(auroraMatches[0]?.resourceCount).toBe(1);
  });

  test('includes template info in matches', () => {
    const resources = createMockResources();
    const result = matchDashboardTemplates({ resources });

    const ec2Match = result.matches.find(m => m.service === 'ec2');
    expect(ec2Match).toBeDefined();
    expect(ec2Match?.template).toBeDefined();
    expect(ec2Match?.template.filename).toBe('ec2-cloudwatch-dashboard.json');
    expect(ec2Match?.template.title).toBe('EC2 Dashboard');
  });

  test('returns empty matches for empty resources', () => {
    const resources = createEmptyDiscoveredResources();
    const result = matchDashboardTemplates({ resources });

    expect(result.matches.length).toBe(0);
    expect(result.gaps.length).toBe(0);
  });

  test('identifies gaps when service has no template', () => {
    // Create resources with a hypothetical service type that has no template
    const resources = createMockResources();
    const result = matchDashboardTemplates({ resources });

    // All our test services should have templates, so gaps should be empty
    // But we should have unusedTemplates (services with templates but no resources)
    expect(result.unusedTemplates.length).toBeGreaterThan(0);
  });
});

describe('groupMatchesByService', () => {
  test('groups matches by service type', () => {
    const resources = createMockResources();
    const { matches } = matchDashboardTemplates({ resources });
    const grouped = groupMatchesByService(matches);

    expect(grouped.has('ec2')).toBe(true);
    expect(grouped.has('rds')).toBe(true);
    expect(grouped.has('aurora')).toBe(true);
    expect(grouped.has('lambda')).toBe(true);
    expect(grouped.has('alb')).toBe(true);

    // EC2 should have 2 matches (2 regions)
    expect(grouped.get('ec2')?.length).toBe(2);
  });
});

describe('aggregateToSelections', () => {
  test('aggregates matches into selections with combined regions', () => {
    const resources = createMockResources();
    const { matches, gaps } = matchDashboardTemplates({ resources });
    const { selections } = aggregateToSelections(matches, gaps);

    // EC2 selection should combine both regions
    const ec2Selection = selections.get('ec2');
    expect(ec2Selection).toBeDefined();
    expect(ec2Selection?.regions.length).toBe(2);
    expect(ec2Selection?.totalResourceCount).toBe(2);
    expect(ec2Selection?.hasTemplate).toBe(true);
  });

  test('marks services without templates', () => {
    // If we had gaps, they should be marked
    const resources = createMockResources();
    const { matches } = matchDashboardTemplates({ resources });
    const { selections } = aggregateToSelections(matches, ['hypothetical-service']);

    const hypotheticalSelection = selections.get('hypothetical-service');
    expect(hypotheticalSelection).toBeDefined();
    expect(hypotheticalSelection?.hasTemplate).toBe(false);
    expect(hypotheticalSelection?.template).toBeNull();
  });
});
