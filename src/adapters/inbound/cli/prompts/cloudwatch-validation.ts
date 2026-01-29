import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { GrafanaPort } from '../../../../ports/outbound/grafana-port.js';
import type { DiscoveredResources, AwsServiceType, AwsResource, RdsResource } from '../../../../domain/entities/aws-resource.js';
import type { DataSourceRef } from '../../../../domain/value-objects/data-source-ref.js';
import {
  SERVICE_CLOUDWATCH_CONFIG,
  AURORA_CLOUDWATCH_CONFIG,
  validateResources,
  summarizeValidation,
  filterValidatedResources,
  generateValidationReport,
  type ServiceValidationResult,
  type ValidationSummary,
  type ValidationRootCause,
} from '../../../../domain/services/cloudwatch-validator.js';
import * as fs from 'fs/promises';
import { join } from 'path';
import { loadConfig } from '../../../../config/index.js';
import { getWorkflowLogger } from '../workflow-logger.js';

export interface CloudWatchValidationResult {
  validatedResources: DiscoveredResources;
  summary: ValidationSummary;
  confirmed: boolean;
}

/**
 * Validates discovered AWS resources against CloudWatch metrics via Grafana.
 * Shows very obvious warnings when resources don't exist in CloudWatch.
 */
export async function runCloudWatchValidation(
  grafana: GrafanaPort,
  dataSource: DataSourceRef,
  resources: DiscoveredResources,
  _regions: readonly string[],
  customerName: string
): Promise<CloudWatchValidationResult> {
  p.intro(pc.bgYellow(pc.black(' CloudWatch Validation ')));

  const spinner = p.spinner();
  spinner.start('Validating discovered resources against CloudWatch metrics...');

  const validationResults: ServiceValidationResult[] = [];

  // Get all unique service+region combinations from discovered resources
  const serviceRegionPairs = getServiceRegionPairs(resources);

  let completed = 0;
  const total = serviceRegionPairs.length;

  // Cache namespace health checks to avoid redundant API calls
  const namespaceHealthCache = new Map<string, boolean>();

  async function checkNamespaceHealth(namespace: string, region: string): Promise<boolean> {
    const cacheKey = `${namespace}:${region}`;
    if (namespaceHealthCache.has(cacheKey)) {
      return namespaceHealthCache.get(cacheKey)!;
    }

    const health = await grafana.checkCloudWatchNamespaceHealth(
      dataSource.uid,
      namespace,
      region
    );
    namespaceHealthCache.set(cacheKey, health.hasMetrics);
    return health.hasMetrics;
  }

  for (const { service, region, serviceResources } of serviceRegionPairs) {
    const config = SERVICE_CLOUDWATCH_CONFIG[service];
    if (!config) continue;

    spinner.message(`Validating ${service} in ${region}... (${++completed}/${total})`);

    // Special handling for RDS: split into Aurora and standard RDS
    if (service === 'rds') {
      const rdsResources = serviceResources as readonly RdsResource[];
      const auroraResources = rdsResources.filter(r => r.isAurora);
      const standardRdsResources = rdsResources.filter(r => !r.isAurora);

      // Check namespace health for diagnostics
      const namespaceAccessible = await checkNamespaceHealth(config.namespace, region);

      // Validate Aurora resources against DBClusterIdentifier
      if (auroraResources.length > 0) {
        const auroraCwResult = await grafana.getCloudWatchDimensionValues(
          dataSource.uid,
          AURORA_CLOUDWATCH_CONFIG.namespace,
          AURORA_CLOUDWATCH_CONFIG.metricName,
          AURORA_CLOUDWATCH_CONFIG.dimensionKey,
          region
        );

        const auroraResult = validateResources(
          auroraResources,
          auroraCwResult.values,
          service,
          region,
          namespaceAccessible
        );

        // Mark this as Aurora in the result for display purposes
        validationResults.push({
          ...auroraResult,
          service: 'rds' as AwsServiceType, // Keep as 'rds' but we'll note it's Aurora in display
        });
      }

      // Validate standard RDS resources against DBInstanceIdentifier
      if (standardRdsResources.length > 0) {
        const rdsCwResult = await grafana.getCloudWatchDimensionValues(
          dataSource.uid,
          config.namespace,
          config.metricName,
          config.dimensionKey,
          region
        );

        const rdsResult = validateResources(
          standardRdsResources,
          rdsCwResult.values,
          service,
          region,
          namespaceAccessible
        );

        validationResults.push(rdsResult);
      }
    } else {
      // Check namespace health for diagnostics
      const namespaceAccessible = await checkNamespaceHealth(config.namespace, region);

      // Standard validation for non-RDS services
      const cwResult = await grafana.getCloudWatchDimensionValues(
        dataSource.uid,
        config.namespace,
        config.metricName,
        config.dimensionKey,
        region
      );

      const result = validateResources(
        serviceResources,
        cwResult.values,
        service,
        region,
        namespaceAccessible
      );

      validationResults.push(result);
    }
  }

  spinner.stop('Validation complete');

  // Summarize results
  const summary = summarizeValidation(validationResults);

  // Log full validation details for audit/debugging
  const logger = getWorkflowLogger();
  logger.log('02-cloudwatch-validation', {
    dataSource: {
      uid: dataSource.uid,
      name: dataSource.name,
    },
    summary: {
      totalDiscovered: summary.totalDiscovered,
      totalMatched: summary.totalMatched,
      totalUnmatched: summary.totalUnmatched,
      hasIssues: summary.hasIssues,
      hasCriticalIssues: summary.hasCriticalIssues,
      warningCount: summary.warnings?.length ?? 0,
    },
    resultsByServiceRegion: summary.results.map(result => ({
      service: result.service,
      region: result.region,
      status: result.status,
      discoveredCount: result.discoveredCount,
      matchedCount: result.matchedResources.length,
      unmatchedCount: result.unmatchedResources.length,
      namespaceAccessible: result.namespaceAccessible,
      matchedResources: result.matchedResources.map(r => ({
        id: r.id,
        name: r.name,
        region: r.region,
        state: (r as any).state ?? null,
        targetHealth: (r as any).targetHealth ? {
          registeredTargetCount: (r as any).targetHealth.registeredTargetCount,
          healthyTargetCount: (r as any).targetHealth.healthyTargetCount,
          unhealthyTargetCount: (r as any).targetHealth.unhealthyTargetCount,
        } : null,
      })),
      unmatchedResources: result.unmatchedResources.map(r => ({
        id: r.id,
        name: r.name,
        region: r.region,
        state: (r as any).state ?? null,
        targetHealth: (r as any).targetHealth ? {
          registeredTargetCount: (r as any).targetHealth.registeredTargetCount,
          healthyTargetCount: (r as any).targetHealth.healthyTargetCount,
          unhealthyTargetCount: (r as any).targetHealth.unhealthyTargetCount,
        } : null,
      })),
      diagnostics: result.diagnostics?.map(d => ({
        resourceId: d.resource.id,
        resourceName: d.resource.name,
        rootCause: d.rootCause,
        recommendation: d.recommendation,
      })) ?? [],
    })),
    warnings: summary.warnings?.map(w => ({
      loadBalancerName: w.resource.name,
      loadBalancerType: w.resource.service,
      region: w.resource.region,
      warningType: w.warningType,
      message: w.message,
      targetHealth: w.resource.targetHealth ? {
        registeredTargetCount: w.resource.targetHealth.registeredTargetCount,
        healthyTargetCount: w.resource.targetHealth.healthyTargetCount,
        unhealthyTargetCount: w.resource.targetHealth.unhealthyTargetCount,
      } : null,
    })) ?? [],
  });

  // Display results with appropriate severity
  displayValidationResults(summary, dataSource.name);

  // If there are critical issues, show a very obvious warning
  if (summary.hasCriticalIssues) {
    showCriticalWarning(summary);
  }

  // Offer to save validation report if there are issues
  if (summary.hasIssues) {
    const saveReport = await p.confirm({
      message: 'Save validation report to file for documentation?',
      initialValue: true,
    });

    if (!p.isCancel(saveReport) && saveReport) {
      const config = loadConfig();
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // 2024-01-29
      const safeCustomerName = customerName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const reportFilename = `${safeCustomerName}-validation-${dateStr}.md`;
      const reportPath = join(config.outputPath, reportFilename);
      const report = generateValidationReport(summary, customerName);
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

  // Ask user to confirm if there are issues
  let confirmed = true;
  if (summary.hasIssues) {
    const confirmResult = await p.confirm({
      message: summary.hasCriticalIssues
        ? pc.red('Continue with only validated resources? (Unmatched resources will be SKIPPED)')
        : pc.yellow('Continue with validated resources?'),
      initialValue: true,
    });

    if (p.isCancel(confirmResult)) {
      confirmed = false;
    } else {
      confirmed = confirmResult;
    }
  }

  // Filter to only validated resources
  const validatedResources = filterValidatedResources(resources, validationResults);

  return {
    validatedResources,
    summary,
    confirmed,
  };
}

function getServiceRegionPairs(
  resources: DiscoveredResources
): Array<{ service: AwsServiceType; region: string; serviceResources: readonly AwsResource[] }> {
  const pairs: Array<{ service: AwsServiceType; region: string; serviceResources: readonly AwsResource[] }> = [];

  const services: Array<{ key: AwsServiceType; items: readonly AwsResource[] }> = [
    { key: 'ec2', items: resources.ec2 },
    { key: 'rds', items: resources.rds },
    { key: 'lambda', items: resources.lambda },
    { key: 'ecs', items: resources.ecs },
    { key: 'eks', items: resources.eks },
    { key: 'elasticache', items: resources.elasticache },
    { key: 'alb', items: resources.alb },
    { key: 'nlb', items: resources.nlb },
    { key: 'apigateway', items: resources.apigateway },
    { key: 's3', items: resources.s3 },
    { key: 'sqs', items: resources.sqs },
  ];

  for (const { key, items } of services) {
    if (items.length === 0) continue;

    // Group by region
    const byRegion = new Map<string, AwsResource[]>();
    for (const item of items) {
      const existing = byRegion.get(item.region) ?? [];
      byRegion.set(item.region, [...existing, item]);
    }

    for (const [region, regionItems] of byRegion) {
      pairs.push({ service: key, region, serviceResources: regionItems });
    }
  }

  return pairs;
}

/**
 * Get a human-readable label for a root cause
 */
function getRootCauseLabel(cause: ValidationRootCause): string {
  switch (cause) {
    case 'permissions':
      return 'PERMISSIONS';
    case 'no_activity':
      return 'NO ACTIVITY';
    case 'config_required':
      return 'CONFIG REQUIRED';
    case 'edge_function':
      return 'LAMBDA@EDGE';
    case 'stopped_resource':
      return 'STOPPED';
    case 'unknown':
    default:
      return 'UNKNOWN';
  }
}

/**
 * Get the color for a root cause
 */
function getRootCauseColor(cause: ValidationRootCause): (text: string) => string {
  switch (cause) {
    case 'permissions':
      return pc.red;
    case 'no_activity':
      return pc.yellow;
    case 'config_required':
      return pc.cyan;
    case 'edge_function':
      return pc.magenta;
    case 'stopped_resource':
      return pc.yellow;
    case 'unknown':
    default:
      return pc.dim;
  }
}

function displayValidationResults(summary: ValidationSummary, dataSourceName: string): void {
  const lines: string[] = [];

  lines.push('');
  lines.push(pc.bold(`CloudWatch Data Source: ${dataSourceName}`));
  lines.push('');

  // Group results by status for cleaner display
  const criticalIssues = summary.results.filter(r => r.status === 'none' && r.discoveredCount > 0);
  const partialIssues = summary.results.filter(r => r.status === 'partial');
  const okResults = summary.results.filter(r => r.status === 'ok');
  // Empty results (no discovered resources) are intentionally not displayed

  // Show critical issues first (discovered but none in CloudWatch)
  if (criticalIssues.length > 0) {
    // Separate by root cause
    const permissionIssues = criticalIssues.filter(r => r.namespaceAccessible === false);
    const activityIssues = criticalIssues.filter(r => r.namespaceAccessible !== false);

    if (permissionIssues.length > 0) {
      lines.push(pc.bgRed(pc.white(pc.bold(' ⛔ PERMISSIONS: Cannot access CloudWatch namespace '))));
      lines.push('');
      for (const result of permissionIssues) {
        lines.push(pc.red(`  ✗ ${result.service.toUpperCase()} (${result.region}): `) +
          pc.red(`Namespace not accessible`));
        lines.push(pc.dim(`    → Check IAM role has cloudwatch:GetMetricData and cloudwatch:ListMetrics`));
      }
      lines.push('');
    }

    if (activityIssues.length > 0) {
      lines.push(pc.bgYellow(pc.black(pc.bold(' ⚠️  NO ACTIVITY: Resources exist but have no metrics '))));
      lines.push('');
      for (const result of activityIssues) {
        lines.push(pc.yellow(`  ⚠ ${result.service.toUpperCase()} (${result.region}): `) +
          `Discovered ${result.discoveredCount} but no CloudWatch data`);

        // Show diagnostics if available
        if (result.diagnostics && result.diagnostics.length > 0) {
          // Group by root cause
          const byCause = new Map<ValidationRootCause, typeof result.diagnostics>();
          for (const diag of result.diagnostics) {
            const cause = diag.rootCause ?? 'unknown';
            const existing = byCause.get(cause) ?? [];
            byCause.set(cause, [...existing, diag]);
          }

          for (const [cause, diags] of byCause) {
            const colorFn = getRootCauseColor(cause);
            const label = getRootCauseLabel(cause);
            if (diags.length <= 2) {
              for (const d of diags) {
                lines.push(colorFn(`    [${label}] ${d.resource.name}`));
              }
            } else {
              lines.push(colorFn(`    [${label}] ${diags.length} resources`));
            }
            if (diags[0]?.recommendation) {
              lines.push(pc.dim(`      → ${diags[0].recommendation}`));
            }
          }
        }
      }
      lines.push('');
    }
  }

  // Show partial matches with diagnostics
  if (partialIssues.length > 0) {
    lines.push(pc.yellow(pc.bold('⚠️  Partial Matches:')));
    for (const result of partialIssues) {
      lines.push(pc.yellow(`  ⚠ ${result.service.toUpperCase()} (${result.region}): `) +
        `${result.matchedResources.length}/${result.discoveredCount} matched`);

      // Show diagnostics grouped by root cause
      if (result.diagnostics && result.diagnostics.length > 0) {
        const byCause = new Map<ValidationRootCause, typeof result.diagnostics>();
        for (const diag of result.diagnostics) {
          const cause = diag.rootCause ?? 'unknown';
          const existing = byCause.get(cause) ?? [];
          byCause.set(cause, [...existing, diag]);
        }

        for (const [cause, diags] of byCause) {
          const colorFn = getRootCauseColor(cause);
          const label = getRootCauseLabel(cause);
          if (diags.length <= 3) {
            for (const d of diags) {
              lines.push(colorFn(`    [${label}] ${d.resource.name}`));
            }
          } else {
            lines.push(colorFn(`    [${label}] ${diags.length} resources`));
          }
          if (diags[0]?.recommendation) {
            lines.push(pc.dim(`      → ${diags[0].recommendation}`));
          }
        }
      } else if (result.unmatchedResources.length <= 3) {
        for (const unmatched of result.unmatchedResources) {
          lines.push(pc.dim(`    - ${unmatched.name} (not in CloudWatch)`));
        }
      } else {
        lines.push(pc.dim(`    - ${result.unmatchedResources.length} resources not in CloudWatch`));
      }
    }
    lines.push('');
  }

  // Show successful validations
  if (okResults.length > 0) {
    lines.push(pc.green(pc.bold('✓ Validated:')));
    for (const result of okResults) {
      lines.push(pc.green(`  ✓ ${result.service.toUpperCase()} (${result.region}): `) +
        `${result.discoveredCount} resources`);
    }
    lines.push('');
  }

  // Summary line
  lines.push(pc.bold('Summary: ') +
    pc.green(`${summary.totalMatched} validated`) +
    (summary.totalUnmatched > 0 ? pc.red(` / ${summary.totalUnmatched} unmatched`) : ''));

  p.note(lines.join('\n'), 'Validation Results');
}

function showCriticalWarning(summary: ValidationSummary): void {
  // Include ALL results that have unmatched resources, not just status='none'
  const resultsWithUnmatched = summary.results.filter(r => r.unmatchedResources.length > 0);

  // Categorize by whether it's a permissions issue or activity issue
  const permissionIssues = resultsWithUnmatched.filter(r => r.namespaceAccessible === false);
  const activityIssues = resultsWithUnmatched.filter(r => r.namespaceAccessible !== false);

  const lines: string[] = [''];

  if (permissionIssues.length > 0) {
    lines.push(pc.bgRed(pc.white(pc.bold('                                                              '))));
    lines.push(pc.bgRed(pc.white(pc.bold('  ⛔ CLOUDWATCH PERMISSIONS ISSUE                             '))));
    lines.push(pc.bgRed(pc.white(pc.bold('                                                              '))));
    lines.push('');
    lines.push(pc.red(pc.bold('  Cannot access CloudWatch namespace for:')));
    for (const r of permissionIssues) {
      lines.push(pc.red(`  • ${r.service.toUpperCase()} (${r.region})`));
    }
    lines.push('');
    lines.push(pc.yellow('  Action required:'));
    lines.push(pc.dim('  • Check IAM role has cloudwatch:GetMetricData and cloudwatch:ListMetrics'));
    lines.push(pc.dim('  • Verify cross-account role assumption is working'));
    lines.push(pc.dim('  • Test data source in Grafana → Explore'));
    lines.push('');
  }

  if (activityIssues.length > 0) {
    const totalUnmatchedInActivity = activityIssues.reduce((sum, r) => sum + r.unmatchedResources.length, 0);

    lines.push(pc.bgYellow(pc.black(pc.bold('                                                              '))));
    lines.push(pc.bgYellow(pc.black(pc.bold(`  ⚠️  ${totalUnmatchedInActivity} RESOURCES WITHOUT CLOUDWATCH METRICS              `))));
    lines.push(pc.bgYellow(pc.black(pc.bold('                                                              '))));
    lines.push('');
    lines.push(pc.yellow(pc.bold('  The following resources have no CloudWatch metrics:')));
    lines.push('');

    // Group by root cause for cleaner display
    const byCause = new Map<ValidationRootCause, Array<{ service: string; region: string; count: number; recommendation?: string }>>();

    for (const result of activityIssues) {
      const causes = new Map<ValidationRootCause, number>();
      let firstRec: string | undefined;

      for (const diag of result.diagnostics ?? []) {
        const cause = diag.rootCause ?? 'unknown';
        causes.set(cause, (causes.get(cause) ?? 0) + 1);
        if (!firstRec && diag.recommendation) {
          firstRec = diag.recommendation;
        }
      }

      for (const [cause, count] of causes) {
        const existing = byCause.get(cause) ?? [];
        existing.push({
          service: result.service.toUpperCase(),
          region: result.region,
          count,
          recommendation: firstRec,
        });
        byCause.set(cause, existing);
      }
    }

    for (const [cause, items] of byCause) {
      const label = getRootCauseLabel(cause);
      const colorFn = getRootCauseColor(cause);

      lines.push(colorFn(pc.bold(`  ${label}:`)));
      for (const item of items) {
        lines.push(colorFn(`    • ${item.service} (${item.region}): ${item.count} resource(s)`));
      }
      if (items[0]?.recommendation) {
        lines.push(pc.dim(`      → ${items[0].recommendation}`));
      }
      lines.push('');
    }
  }

  lines.push(pc.cyan('  Note: Alerts for these resources will be skipped since there is no data to alert on.'));
  lines.push(pc.cyan('  Re-run the provisioner after resources become active to add monitoring.'));
  lines.push('');

  console.log(lines.join('\n'));
}
