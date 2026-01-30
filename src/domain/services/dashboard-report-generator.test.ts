/**
 * Dashboard Report Generator Tests
 */

import { describe, test, expect } from 'bun:test';
import { generateDashboardReport } from './dashboard-report-generator.js';
import type { DashboardMatch, DashboardSelection } from '../entities/dashboard.js';

describe('generateDashboardReport', () => {
  test('generates a valid markdown report', () => {
    const matches: DashboardMatch[] = [
      {
        service: 'ec2',
        region: 'us-east-1',
        template: {
          filename: 'ec2-cloudwatch-dashboard.json',
          title: 'EC2 Dashboard',
          namespace: 'AWS/EC2',
          dimensionKey: 'InstanceId',
          variableName: 'instance_id',
        },
        resourceCount: 5,
      },
      {
        service: 'ec2',
        region: 'us-west-2',
        template: {
          filename: 'ec2-cloudwatch-dashboard.json',
          title: 'EC2 Dashboard',
          namespace: 'AWS/EC2',
          dimensionKey: 'InstanceId',
          variableName: 'instance_id',
        },
        resourceCount: 3,
      },
      {
        service: 'rds',
        region: 'us-east-1',
        template: {
          filename: 'rds-cloudwatch-dashboard.json',
          title: 'RDS Dashboard',
          namespace: 'AWS/RDS',
          dimensionKey: 'DBInstanceIdentifier',
          variableName: 'db_instance',
        },
        resourceCount: 2,
      },
    ];

    const selections: DashboardSelection[] = [
      {
        service: 'ec2',
        template: {
          filename: 'ec2-cloudwatch-dashboard.json',
          title: 'EC2 Dashboard',
          namespace: 'AWS/EC2',
          dimensionKey: 'InstanceId',
          variableName: 'instance_id',
        },
        selected: true,
        hasTemplate: true,
        regions: ['us-east-1', 'us-west-2'],
        totalResourceCount: 8,
      },
      {
        service: 'rds',
        template: {
          filename: 'rds-cloudwatch-dashboard.json',
          title: 'RDS Dashboard',
          namespace: 'AWS/RDS',
          dimensionKey: 'DBInstanceIdentifier',
          variableName: 'db_instance',
        },
        selected: false, // User deselected this one
        hasTemplate: true,
        regions: ['us-east-1'],
        totalResourceCount: 2,
      },
    ];

    const report = generateDashboardReport({
      customerName: 'TestCustomer',
      folderPath: 'NOC-Monitoring/AWS/TestCustomer',
      matches,
      gaps: ['sqs', 'sns'],
      selections,
      grafanaUrl: 'https://grafana.example.com',
      datasourceUid: 'cloudwatch-123',
      defaultRegion: 'us-east-1',
    });

    // Verify report structure
    expect(report).toContain('# Dashboard Deployment Report');
    expect(report).toContain('**Customer:** TestCustomer');
    expect(report).toContain('## Configuration');
    expect(report).toContain('https://grafana.example.com');
    expect(report).toContain('cloudwatch-123');

    // Verify summary
    expect(report).toContain('## Summary');
    expect(report).toContain('**Dashboards Deployed:** 1');
    expect(report).toContain('**Dashboards Skipped:** 1');
    expect(report).toContain('**Services Without Templates:** 2');

    // Verify deployed dashboards section
    expect(report).toContain('## Deployed Dashboards');
    expect(report).toContain('EC2 Dashboard');

    // Verify skipped dashboards section
    expect(report).toContain('## Skipped Dashboards');
    expect(report).toContain('RDS Dashboard');

    // Verify gaps section
    expect(report).toContain('## Services Without Dashboard Templates');
    expect(report).toContain('SQS');
    expect(report).toContain('SNS');

    // Verify resource details
    expect(report).toContain('## Resource Details by Service');
    expect(report).toContain('### EC2');
    expect(report).toContain('### RDS');
  });

  test('handles empty gaps gracefully', () => {
    const report = generateDashboardReport({
      customerName: 'Test',
      folderPath: 'Test/Folder',
      matches: [],
      gaps: [],
      selections: [],
      grafanaUrl: 'https://grafana.example.com',
      datasourceUid: 'cw-123',
      defaultRegion: 'us-east-1',
    });

    expect(report).toContain('# Dashboard Deployment Report');
    expect(report).not.toContain('## Services Without Dashboard Templates');
  });
});
