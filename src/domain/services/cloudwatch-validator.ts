import type {
  AwsServiceType,
  DiscoveredResources,
  AwsResource,
  RdsResource,
  Ec2Resource,
  LambdaResource,
  EcsResource,
  EcsServiceResource,
  AlbResource,
  NlbResource,
  S3Resource,
  ElastiCacheResource,
} from '../entities/aws-resource.js';

export interface CloudWatchConfig {
  namespace: string;
  dimensionKey: string;
  metricName: string; // A common metric to check for existence
}

/**
 * Mapping of AWS service types to their CloudWatch namespace and dimension key
 */
export const SERVICE_CLOUDWATCH_CONFIG: Record<AwsServiceType, CloudWatchConfig> = {
  ec2: { namespace: 'AWS/EC2', dimensionKey: 'InstanceId', metricName: 'CPUUtilization' },
  rds: { namespace: 'AWS/RDS', dimensionKey: 'DBInstanceIdentifier', metricName: 'CPUUtilization' },
  lambda: { namespace: 'AWS/Lambda', dimensionKey: 'FunctionName', metricName: 'Invocations' },
  ecs: { namespace: 'AWS/ECS', dimensionKey: 'ServiceName', metricName: 'CPUUtilization' },
  eks: { namespace: 'AWS/EKS', dimensionKey: 'ClusterName', metricName: 'cluster_failed_node_count' },
  elasticache: { namespace: 'AWS/ElastiCache', dimensionKey: 'CacheClusterId', metricName: 'CPUUtilization' },
  alb: { namespace: 'AWS/ApplicationELB', dimensionKey: 'LoadBalancer', metricName: 'RequestCount' },
  nlb: { namespace: 'AWS/NetworkELB', dimensionKey: 'LoadBalancer', metricName: 'ProcessedBytes' },
  apigateway: { namespace: 'AWS/ApiGateway', dimensionKey: 'ApiName', metricName: 'Count' },
  s3: { namespace: 'AWS/S3', dimensionKey: 'BucketName', metricName: 'NumberOfObjects' },
  sqs: { namespace: 'AWS/SQS', dimensionKey: 'QueueName', metricName: 'NumberOfMessagesReceived' },
};

/**
 * Aurora uses DBClusterIdentifier instead of DBInstanceIdentifier
 */
export const AURORA_CLOUDWATCH_CONFIG: CloudWatchConfig = {
  namespace: 'AWS/RDS',
  dimensionKey: 'DBClusterIdentifier',
  metricName: 'CPUUtilization',
};

/**
 * Get the CloudWatch config for a resource, handling Aurora specially
 */
export function getCloudWatchConfigForResource(resource: AwsResource): CloudWatchConfig {
  if (resource.service === 'rds') {
    const rdsResource = resource as RdsResource;
    if (rdsResource.isAurora) {
      return AURORA_CLOUDWATCH_CONFIG;
    }
  }
  return SERVICE_CLOUDWATCH_CONFIG[resource.service];
}

/**
 * Root cause categories for resources missing from CloudWatch
 */
export type ValidationRootCause =
  | 'permissions'       // Namespace not accessible at all
  | 'no_activity'       // Namespace exists but resources have no metrics (no traffic/invocations)
  | 'config_required'   // Service requires explicit configuration (S3 request metrics, Container Insights)
  | 'edge_function'     // Lambda@Edge uses different naming convention
  | 'stopped_resource'  // EC2/RDS instances that are stopped
  | 'no_targets'        // Load balancer has no registered targets (intentionally unused)
  | 'baseline_unhealthy' // Load balancer has targets but all are unhealthy (will fire immediately)
  | 'unknown';          // Unable to determine cause

export interface ResourceDiagnostic {
  readonly resource: AwsResource;
  readonly matched: boolean;
  readonly rootCause?: ValidationRootCause;
  readonly recommendation?: string;
}

export interface ServiceValidationResult {
  readonly service: AwsServiceType;
  readonly region: string;
  readonly discoveredCount: number;
  readonly cloudwatchCount: number;
  readonly matchedResources: readonly AwsResource[];
  readonly unmatchedResources: readonly AwsResource[];
  readonly status: 'ok' | 'partial' | 'none' | 'empty';
  /** Whether the namespace itself is accessible (has any metrics) */
  readonly namespaceAccessible?: boolean;
  /** Diagnostics for unmatched resources */
  readonly diagnostics?: readonly ResourceDiagnostic[];
}

export interface LoadBalancerWarning {
  readonly resource: AlbResource | NlbResource;
  readonly warningType: 'baseline_unhealthy';
  readonly message: string;
}

export interface ValidationSummary {
  readonly results: readonly ServiceValidationResult[];
  readonly totalDiscovered: number;
  readonly totalMatched: number;
  readonly totalUnmatched: number;
  readonly hasIssues: boolean;
  readonly hasCriticalIssues: boolean; // When discovered > 0 but cloudwatch = 0
  readonly warnings: readonly LoadBalancerWarning[]; // Included resources with warnings
}

/**
 * Determine the root cause for an unmatched resource using VERIFIED data from AWS.
 * Only returns a specific root cause if we can confirm it from the resource's state.
 */
export function diagnoseUnmatchedResource(
  resource: AwsResource,
  namespaceAccessible: boolean
): ResourceDiagnostic {
  // If namespace is not accessible, it's a permissions issue
  if (!namespaceAccessible) {
    return {
      resource,
      matched: false,
      rootCause: 'permissions',
      recommendation: 'Check IAM role permissions for cloudwatch:GetMetricData and cloudwatch:ListMetrics',
    };
  }

  // Service-specific diagnostics using VERIFIED state
  switch (resource.service) {
    case 'ec2': {
      const ec2 = resource as Ec2Resource;
      if (ec2.state !== 'running') {
        return {
          resource,
          matched: false,
          rootCause: 'stopped_resource',
          recommendation: `EC2 instance is ${ec2.state} - only running instances emit metrics`,
        };
      }
      return {
        resource,
        matched: false,
        rootCause: 'unknown',
        recommendation: 'Instance is running but no metrics found - may be newly launched (wait 5 min)',
      };
    }

    case 'rds': {
      const rds = resource as RdsResource;
      if (rds.status !== 'available') {
        return {
          resource,
          matched: false,
          rootCause: 'stopped_resource',
          recommendation: `RDS instance status is "${rds.status}" - only available instances emit metrics`,
        };
      }
      if (rds.isAurora) {
        return {
          resource,
          matched: false,
          rootCause: 'unknown',
          recommendation: 'Aurora cluster is available - verify DBClusterIdentifier dimension is being queried',
        };
      }
      return {
        resource,
        matched: false,
        rootCause: 'unknown',
        recommendation: 'RDS instance is available but no metrics found - may be newly created',
      };
    }

    case 'lambda': {
      const lambda = resource as LambdaResource;
      // VERIFIED: isEdgeFunction is checked via GetPolicy API for CloudFront permissions
      if (lambda.isEdgeFunction) {
        return {
          resource,
          matched: false,
          rootCause: 'edge_function',
          recommendation: 'Lambda@Edge function - metrics appear in us-east-1 as "{region}.{function_name}"',
        };
      }
      return {
        resource,
        matched: false,
        rootCause: 'no_activity',
        recommendation: 'Lambda function has not been invoked - metrics appear after first invocation',
      };
    }

    case 'ecs': {
      const ecs = resource as EcsResource;
      if (ecs.resourceType === 'service') {
        const ecsService = ecs as EcsServiceResource;
        // VERIFIED: containerInsightsEnabled is checked via DescribeClusters API
        if (!ecsService.containerInsightsEnabled) {
          return {
            resource,
            matched: false,
            rootCause: 'config_required',
            recommendation: `Container Insights is DISABLED on cluster "${ecsService.clusterName}" - enable it for CloudWatch metrics`,
          };
        }
        if (ecsService.runningCount === 0) {
          return {
            resource,
            matched: false,
            rootCause: 'stopped_resource',
            recommendation: `ECS service has 0 running tasks (desired: ${ecsService.desiredCount})`,
          };
        }
      }
      return {
        resource,
        matched: false,
        rootCause: 'unknown',
        recommendation: 'ECS resource exists but no metrics found - Container Insights may need enabling',
      };
    }

    case 's3': {
      const s3 = resource as S3Resource;
      // VERIFIED: hasRequestMetrics is checked via GetBucketMetricsConfiguration API
      if (!s3.hasRequestMetrics) {
        return {
          resource,
          matched: false,
          rootCause: 'config_required',
          recommendation: 'S3 request metrics are NOT ENABLED on this bucket - enable in bucket properties',
        };
      }
      return {
        resource,
        matched: false,
        rootCause: 'unknown',
        recommendation: 'S3 bucket has request metrics enabled but no data - may be newly configured',
      };
    }

    case 'alb': {
      const alb = resource as AlbResource;
      if (alb.state !== 'active') {
        return {
          resource,
          matched: false,
          rootCause: 'stopped_resource',
          recommendation: `ALB state is "${alb.state}" - only active load balancers emit metrics`,
        };
      }
      // Check target health if available
      if (alb.targetHealth) {
        if (alb.targetHealth.registeredTargetCount === 0) {
          return {
            resource,
            matched: false,
            rootCause: 'no_targets',
            recommendation: `ALB has no registered targets - likely intentionally unused or misconfigured`,
          };
        }
        if (alb.targetHealth.healthyTargetCount === 0 && alb.targetHealth.unhealthyTargetCount > 0) {
          return {
            resource,
            matched: false,
            rootCause: 'baseline_unhealthy',
            recommendation: `ALB has ${alb.targetHealth.unhealthyTargetCount} targets but all are unhealthy - alerts will fire immediately`,
          };
        }
      }
      return {
        resource,
        matched: false,
        rootCause: 'no_activity',
        recommendation: 'ALB is active but no metrics - has not received traffic yet',
      };
    }

    case 'nlb': {
      const nlb = resource as NlbResource;
      if (nlb.state !== 'active') {
        return {
          resource,
          matched: false,
          rootCause: 'stopped_resource',
          recommendation: `NLB state is "${nlb.state}" - only active load balancers emit metrics`,
        };
      }
      // Check target health if available
      if (nlb.targetHealth) {
        if (nlb.targetHealth.registeredTargetCount === 0) {
          return {
            resource,
            matched: false,
            rootCause: 'no_targets',
            recommendation: `NLB has no registered targets - likely intentionally unused or misconfigured`,
          };
        }
        if (nlb.targetHealth.healthyTargetCount === 0 && nlb.targetHealth.unhealthyTargetCount > 0) {
          return {
            resource,
            matched: false,
            rootCause: 'baseline_unhealthy',
            recommendation: `NLB has ${nlb.targetHealth.unhealthyTargetCount} targets but all are unhealthy - alerts will fire immediately`,
          };
        }
      }
      return {
        resource,
        matched: false,
        rootCause: 'no_activity',
        recommendation: 'NLB is active but no metrics - has not received traffic yet',
      };
    }

    case 'elasticache': {
      const cache = resource as ElastiCacheResource;
      if (cache.status !== 'available') {
        return {
          resource,
          matched: false,
          rootCause: 'stopped_resource',
          recommendation: `ElastiCache status is "${cache.status}" - only available clusters emit metrics`,
        };
      }
      return {
        resource,
        matched: false,
        rootCause: 'unknown',
        recommendation: 'ElastiCache is available but no metrics found',
      };
    }

    case 'apigateway':
      return {
        resource,
        matched: false,
        rootCause: 'no_activity',
        recommendation: 'API Gateway only emits metrics after receiving API calls',
      };

    case 'eks':
      return {
        resource,
        matched: false,
        rootCause: 'config_required',
        recommendation: 'EKS requires Container Insights to be enabled for CloudWatch metrics',
      };

    case 'sqs':
      return {
        resource,
        matched: false,
        rootCause: 'no_activity',
        recommendation: 'SQS queue has not received messages',
      };

    default:
      return {
        resource,
        matched: false,
        rootCause: 'unknown',
        recommendation: 'Unable to determine root cause - resource may be newly created',
      };
  }
}

/**
 * Get the CloudWatch dimension value for a resource.
 * Different services use different identifiers in CloudWatch.
 */
function getCloudWatchIdentifier(resource: AwsResource): string {
  switch (resource.service) {
    case 'ec2':
      // CloudWatch uses InstanceId (i-xxxxx), not Name tag
      return resource.id;
    case 'rds':
      // For Aurora clusters, id is DBClusterIdentifier
      // For RDS instances, id is DBInstanceIdentifier
      return resource.id;
    case 'lambda':
      // CloudWatch uses FunctionName
      return resource.name;
    case 'ecs':
      // CloudWatch uses ServiceName (which is resource.name)
      return resource.name;
    case 'elasticache':
      // CloudWatch uses CacheClusterId
      return resource.id;
    case 'alb':
    case 'nlb':
      // CloudWatch uses LoadBalancer ARN suffix: app/name/id or net/name/id
      // Extract from ARN: arn:aws:elasticloadbalancing:region:account:loadbalancer/app/name/id
      const arnParts = resource.arn.split(':loadbalancer/');
      return arnParts[1] ?? resource.name;
    case 'apigateway':
      // CloudWatch uses ApiName
      return resource.name;
    case 's3':
      // CloudWatch uses BucketName
      return resource.name;
    case 'sqs':
      // CloudWatch uses QueueName
      return resource.name;
    case 'eks':
      // CloudWatch uses ClusterName
      return resource.name;
  }
}

/**
 * Get all possible CloudWatch identifiers for a resource.
 * Some services (like Lambda@Edge) may have multiple valid identifiers.
 */
function getCloudWatchIdentifiers(resource: AwsResource): string[] {
  const primary = getCloudWatchIdentifier(resource);
  const identifiers = [primary];

  // Lambda@Edge functions may appear in CloudWatch with region prefix
  // e.g., "origin_request" in discovery but "us-east-1.origin_request" in CloudWatch
  if (resource.service === 'lambda') {
    // Add region-prefixed version for Lambda@Edge
    identifiers.push(`${resource.region}.${primary}`);
  }

  return identifiers;
}

/**
 * Validates discovered AWS resources against CloudWatch metrics.
 * Returns matched resources that actually exist in CloudWatch.
 *
 * @param namespaceAccessible - Whether the CloudWatch namespace has any metrics at all.
 *                              Used to distinguish permissions issues from no-activity issues.
 */
export function validateResources(
  discoveredResources: readonly AwsResource[],
  cloudwatchDimensionValues: readonly string[],
  service: AwsServiceType,
  region: string,
  namespaceAccessible: boolean = true
): ServiceValidationResult {
  if (discoveredResources.length === 0) {
    return {
      service,
      region,
      discoveredCount: 0,
      cloudwatchCount: cloudwatchDimensionValues.length,
      matchedResources: [],
      unmatchedResources: [],
      status: 'empty',
      namespaceAccessible,
    };
  }

  // Match discovered resources to CloudWatch dimension values
  const cwValuesLower = new Set(cloudwatchDimensionValues.map(v => v.toLowerCase()));

  const matched: AwsResource[] = [];
  const unmatched: AwsResource[] = [];

  for (const resource of discoveredResources) {
    // Get all possible identifiers that CloudWatch might use for this resource
    const possibleIds = getCloudWatchIdentifiers(resource).map(id => id.toLowerCase());

    // Check if any of the possible identifiers match
    const isMatched = possibleIds.some(id => cwValuesLower.has(id));

    if (isMatched) {
      // Even if CloudWatch has metrics, check if ALB/NLB has no registered targets
      // No targets = nothing to monitor, exclude from alerting
      if (resource.service === 'alb' || resource.service === 'nlb') {
        const lb = resource as AlbResource | NlbResource;
        if (lb.targetHealth && lb.targetHealth.registeredTargetCount === 0) {
          unmatched.push(resource);
          continue;
        }
        // Note: baseline_unhealthy (all targets unhealthy) is INCLUDED
        // Real alerts should fire if there's a problem, even immediately after deployment
      }
      matched.push(resource);
    } else {
      unmatched.push(resource);
    }
  }

  let status: ServiceValidationResult['status'];
  if (matched.length === discoveredResources.length) {
    status = 'ok';
  } else if (matched.length > 0) {
    status = 'partial';
  } else {
    status = 'none';
  }

  // Generate diagnostics for unmatched resources
  const diagnostics: ResourceDiagnostic[] = unmatched.map(resource =>
    diagnoseUnmatchedResource(resource, namespaceAccessible)
  );

  return {
    service,
    region,
    discoveredCount: discoveredResources.length,
    cloudwatchCount: cloudwatchDimensionValues.length,
    matchedResources: matched,
    unmatchedResources: unmatched,
    status,
    namespaceAccessible,
    diagnostics,
  };
}

/**
 * Summarizes validation results across all services/regions
 */
export function summarizeValidation(results: readonly ServiceValidationResult[]): ValidationSummary {
  let totalDiscovered = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;
  let hasIssues = false;
  let hasCriticalIssues = false;
  const warnings: LoadBalancerWarning[] = [];

  for (const result of results) {
    totalDiscovered += result.discoveredCount;
    totalMatched += result.matchedResources.length;
    totalUnmatched += result.unmatchedResources.length;

    if (result.status === 'partial' || result.status === 'none') {
      hasIssues = true;
    }
    if (result.status === 'none' && result.discoveredCount > 0) {
      hasCriticalIssues = true;
    }

    // Check matched ALB/NLB resources for baseline_unhealthy warning
    for (const resource of result.matchedResources) {
      if (resource.service === 'alb' || resource.service === 'nlb') {
        const lb = resource as AlbResource | NlbResource;
        if (lb.targetHealth &&
            lb.targetHealth.healthyTargetCount === 0 &&
            lb.targetHealth.unhealthyTargetCount > 0) {
          warnings.push({
            resource: lb,
            warningType: 'baseline_unhealthy',
            message: `All ${lb.targetHealth.unhealthyTargetCount} targets are unhealthy - alerts may fire immediately`,
          });
        }
      }
    }
  }

  return {
    results,
    totalDiscovered,
    totalMatched,
    totalUnmatched,
    hasIssues,
    hasCriticalIssues,
    warnings,
  };
}

/**
 * Generate a documentation-friendly report of validation results
 * Focuses on exclusions and the rationale for each exclusion decision
 */
export function generateValidationReport(summary: ValidationSummary, customerName?: string): string {
  const lines: string[] = [];
  const now = new Date();
  const timestamp = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  lines.push('# CloudWatch Validation Report');
  if (customerName) {
    lines.push(`**Customer:** ${customerName}`);
  }
  lines.push(`**Generated:** ${timestamp}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push(`- Total Discovered: ${summary.totalDiscovered}`);
  lines.push(`- Included in Monitoring: ${summary.totalMatched}`);
  lines.push(`- Excluded from Monitoring: ${summary.totalUnmatched}`);
  if (summary.warnings.length > 0) {
    lines.push(`- Warnings: ${summary.warnings.length}`);
  }
  lines.push('');

  // Warnings section - resources that ARE included but may have issues
  if (summary.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    lines.push('The following resources are **included in monitoring** but have conditions that may ');
    lines.push('cause alerts to fire immediately after deployment.');
    lines.push('');

    const baselineUnhealthyWarnings = summary.warnings.filter(w => w.warningType === 'baseline_unhealthy');
    if (baselineUnhealthyWarnings.length > 0) {
      lines.push('### Load Balancers With All Targets Unhealthy');
      lines.push('');
      lines.push('**Verified via:** ELBv2 DescribeTargetHealth API');
      lines.push('');
      lines.push('**Rationale:** These load balancers have registered targets but all are currently unhealthy. ');
      lines.push('Alerts for these resources **will fire immediately** after deployment. This is intentional - ');
      lines.push('if there is a real problem, you want to know about it.');
      lines.push('');
      lines.push('Possible causes:');
      lines.push('- Active outage that should be investigated');
      lines.push('- Service intentionally scaled to zero');
      lines.push('- Health check misconfiguration');
      lines.push('');

      for (const warning of baselineUnhealthyWarnings) {
        const lb = warning.resource;
        const th = lb.targetHealth;
        lines.push(`- \`${lb.name}\` (${lb.service.toUpperCase()}, ${lb.region})`);
        if (th) {
          lines.push(`  - Healthy: ${th.healthyTargetCount}, Unhealthy: ${th.unhealthyTargetCount}`);

          // Show unhealthy target details
          const unhealthyDetails = th.details.filter(t => t.state === 'unhealthy');
          if (unhealthyDetails.length > 0) {
            lines.push('  - Unhealthy targets:');
            for (const target of unhealthyDetails.slice(0, 3)) {
              lines.push(`    - \`${target.targetId}\`: ${target.reason ?? 'Unknown'}`);
            }
            if (unhealthyDetails.length > 3) {
              lines.push(`    - ... and ${unhealthyDetails.length - 3} more`);
            }
          }
        }
      }
      lines.push('');
      lines.push('**Decision:** INCLUDED - real problems should trigger alerts, even immediately after deployment');
      lines.push('');
    }
  }

  // Get all diagnostics (exclusions)
  const allDiagnostics = summary.results.flatMap(r => r.diagnostics ?? []);

  if (allDiagnostics.length === 0) {
    lines.push('*No resources were excluded - all discovered resources have CloudWatch metrics.*');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Exclusions');
  lines.push('');
  lines.push('The following resources were excluded from monitoring. Each exclusion includes ');
  lines.push('the verified reason from AWS and the rationale for the decision.');
  lines.push('');

  // Group by root cause for organized output
  const byCause = new Map<ValidationRootCause, ResourceDiagnostic[]>();
  for (const diag of allDiagnostics) {
    const cause = diag.rootCause ?? 'unknown';
    const existing = byCause.get(cause) ?? [];
    byCause.set(cause, [...existing, diag]);
  }

  // Process each cause category with detailed rationale

  // 1. Stopped Resources
  const stoppedResources = byCause.get('stopped_resource') ?? [];
  if (stoppedResources.length > 0) {
    lines.push('### Stopped/Inactive Resources');
    lines.push('');
    lines.push('**Rationale:** These resources exist in AWS but are not currently running. ');
    lines.push('Stopped resources do not emit CloudWatch metrics. Creating alerts for them would ');
    lines.push('result in "No Data" states, which can be confusing and mask real issues.');
    lines.push('');
    lines.push('**Verified via:** EC2 DescribeInstances (state), RDS DescribeDBInstances (status), ECS DescribeServices (runningCount)');
    lines.push('');

    renderExclusionTable(lines, stoppedResources, [
      { header: 'Resource', getter: (d) => d.resource.name },
      { header: 'Service', getter: (d) => d.resource.service.toUpperCase() },
      { header: 'Region', getter: (d) => d.resource.region },
      { header: 'State', getter: (d) => getResourceState(d.resource) },
    ]);
    lines.push('');
    lines.push('**Decision:** EXCLUDED - alerts would show "No Data"');
    lines.push('');
  }

  // 2. Configuration Required
  const configRequired = byCause.get('config_required') ?? [];
  if (configRequired.length > 0) {
    lines.push('### Configuration Required');
    lines.push('');
    lines.push('**Rationale:** These resources require explicit AWS configuration to emit CloudWatch metrics. ');
    lines.push('Without the required configuration, no metrics are available for alerting.');
    lines.push('');

    // Group by configuration type
    const s3Resources = configRequired.filter(d => d.resource.service === 's3');
    const ecsResources = configRequired.filter(d => d.resource.service === 'ecs');
    const eksResources = configRequired.filter(d => d.resource.service === 'eks');

    if (s3Resources.length > 0) {
      lines.push('#### S3 Request Metrics Not Enabled');
      lines.push('');
      lines.push('**Verified via:** S3 GetBucketMetricsConfiguration API');
      lines.push('');
      lines.push('S3 buckets only emit storage metrics by default. Request metrics (4xx/5xx errors, ');
      lines.push('latency) must be explicitly enabled in bucket properties → Metrics → Request metrics.');
      lines.push('');
      for (const d of s3Resources) {
        lines.push(`- \`${d.resource.name}\` (${d.resource.region})`);
      }
      lines.push('');
    }

    if (ecsResources.length > 0) {
      lines.push('#### ECS Container Insights Not Enabled');
      lines.push('');
      lines.push('**Verified via:** ECS DescribeClusters API (settings.containerInsights)');
      lines.push('');
      lines.push('ECS clusters require Container Insights to emit CPU/Memory metrics. Enable via:');
      lines.push('`aws ecs update-cluster-settings --cluster <name> --settings name=containerInsights,value=enabled`');
      lines.push('');
      for (const d of ecsResources) {
        const ecs = d.resource as EcsServiceResource;
        lines.push(`- \`${d.resource.name}\` on cluster \`${ecs.clusterName}\` (${d.resource.region})`);
      }
      lines.push('');
    }

    if (eksResources.length > 0) {
      lines.push('#### EKS Container Insights Not Enabled');
      lines.push('');
      lines.push('EKS clusters require the CloudWatch agent with Container Insights addon for metrics.');
      lines.push('');
      for (const d of eksResources) {
        lines.push(`- \`${d.resource.name}\` (${d.resource.region})`);
      }
      lines.push('');
    }

    lines.push('**Decision:** EXCLUDED - no metrics available until configuration is enabled');
    lines.push('');
  }

  // 3. Lambda@Edge Functions
  const edgeFunctions = byCause.get('edge_function') ?? [];
  if (edgeFunctions.length > 0) {
    lines.push('### Lambda@Edge Functions');
    lines.push('');
    lines.push('**Rationale:** Lambda@Edge functions are replicated to CloudFront edge locations. ');
    lines.push('Their metrics appear in CloudWatch with a region-prefixed name (e.g., `us-east-1.function_name`) ');
    lines.push('rather than the standard function name.');
    lines.push('');
    lines.push('**Verified via:** Lambda GetPolicy API (checks for edgelambda.amazonaws.com or cloudfront.amazonaws.com principal)');
    lines.push('');

    for (const d of edgeFunctions) {
      lines.push(`- \`${d.resource.name}\` (${d.resource.region})`);
      lines.push(`  - CloudWatch dimension: \`${d.resource.region}.${d.resource.name}\``);
    }
    lines.push('');
    lines.push('**Decision:** EXCLUDED - metrics use different naming convention; requires manual alert configuration');
    lines.push('');
  }

  // 4. Load Balancer - No Registered Targets
  const noTargets = byCause.get('no_targets') ?? [];

  if (noTargets.length > 0) {
    lines.push('### Load Balancers With No Targets');
    lines.push('');
    lines.push('**Verified via:** ELBv2 DescribeTargetHealth API');
    lines.push('');
    lines.push('**Rationale:** These load balancers have no targets registered. This typically indicates:');
    lines.push('- Infrastructure reserved for future use');
    lines.push('- Target group not yet attached to ASG/ECS service');
    lines.push('- Deprecated infrastructure pending decommission');
    lines.push('');
    lines.push('There is nothing to become unhealthy, so health-based alerts would be meaningless.');
    lines.push('');

    for (const d of noTargets) {
      const lb = d.resource as AlbResource | NlbResource;
      const th = lb.targetHealth;
      lines.push(`- \`${lb.name}\` (${lb.service.toUpperCase()}, ${lb.region})`);
      if (th) {
        lines.push(`  - Target Groups: ${th.targetGroupCount}, Registered Targets: ${th.registeredTargetCount}`);
      }
    }
    lines.push('');
    lines.push('**Decision:** EXCLUDED - no targets to become unhealthy');
    lines.push('');
  }

  // 5. No Activity
  const noActivity = byCause.get('no_activity') ?? [];
  if (noActivity.length > 0) {
    lines.push('### No CloudWatch Activity');
    lines.push('');
    lines.push('**Rationale:** These resources exist and are in a running/active state, but have not ');
    lines.push('generated any CloudWatch metrics. This typically means:');
    lines.push('- Resource was recently created (metrics appear within 5 minutes of activity)');
    lines.push('- Resource has not received any traffic/invocations');
    lines.push('- Resource is dormant/unused');
    lines.push('');
    lines.push('**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers');
    lines.push('');

    // Group by service
    const byService = new Map<string, ResourceDiagnostic[]>();
    for (const d of noActivity) {
      const key = `${d.resource.service}/${d.resource.region}`;
      const existing = byService.get(key) ?? [];
      byService.set(key, [...existing, d]);
    }

    for (const [key, diags] of byService) {
      lines.push(`**${key.toUpperCase()}:**`);
      for (const d of diags) {
        lines.push(`- \`${d.resource.name}\``);
      }
      lines.push('');
    }

    lines.push('**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic');
    lines.push('');
  }

  // 6. Permissions Issues
  const permissions = byCause.get('permissions') ?? [];
  if (permissions.length > 0) {
    lines.push('### Permissions Issues');
    lines.push('');
    lines.push('**Rationale:** The CloudWatch namespace for these resources returned no metrics at all. ');
    lines.push('This indicates the Grafana data source IAM role may lack permissions.');
    lines.push('');
    lines.push('**Required permissions:**');
    lines.push('- `cloudwatch:GetMetricData`');
    lines.push('- `cloudwatch:ListMetrics`');
    lines.push('');

    // Group by namespace
    const byNamespace = new Map<string, ResourceDiagnostic[]>();
    for (const d of permissions) {
      const config = SERVICE_CLOUDWATCH_CONFIG[d.resource.service];
      const key = config.namespace;
      const existing = byNamespace.get(key) ?? [];
      byNamespace.set(key, [...existing, d]);
    }

    for (const [namespace, diags] of byNamespace) {
      lines.push(`**${namespace}:**`);
      for (const d of diags) {
        lines.push(`- \`${d.resource.name}\` (${d.resource.region})`);
      }
      lines.push('');
    }

    lines.push('**Decision:** EXCLUDED - unable to access CloudWatch metrics; fix IAM permissions');
    lines.push('');
  }

  // 7. Unknown causes
  const unknown = byCause.get('unknown') ?? [];
  if (unknown.length > 0) {
    lines.push('### Unable to Determine Cause');
    lines.push('');
    lines.push('**Rationale:** These resources do not have CloudWatch metrics, but the specific ');
    lines.push('cause could not be verified from AWS APIs. Manual investigation may be required.');
    lines.push('');

    for (const d of unknown) {
      lines.push(`- \`${d.resource.name}\` (${d.resource.service.toUpperCase()}, ${d.resource.region})`);
      if (d.recommendation) {
        lines.push(`  > ${d.recommendation}`);
      }
    }
    lines.push('');
    lines.push('**Decision:** EXCLUDED - reason unknown; investigate manually');
    lines.push('');
  }

  // Exclusion summary table
  lines.push('## Exclusion Summary');
  lines.push('');
  lines.push('| Category | Count | Rationale |');
  lines.push('|----------|-------|-----------|');
  if (stoppedResources.length > 0) {
    lines.push(`| Stopped Resources | ${stoppedResources.length} | Not running, no metrics emitted |`);
  }
  if (configRequired.length > 0) {
    lines.push(`| Config Required | ${configRequired.length} | AWS configuration needed for metrics |`);
  }
  if (edgeFunctions.length > 0) {
    lines.push(`| Lambda@Edge | ${edgeFunctions.length} | Different naming convention in CloudWatch |`);
  }
  if (noTargets.length > 0) {
    lines.push(`| No Targets | ${noTargets.length} | Load balancer has no registered targets |`);
  }
  if (noActivity.length > 0) {
    lines.push(`| No Activity | ${noActivity.length} | No traffic/invocations, no metrics yet |`);
  }
  if (permissions.length > 0) {
    lines.push(`| Permissions | ${permissions.length} | IAM permissions needed |`);
  }
  if (unknown.length > 0) {
    lines.push(`| Unknown | ${unknown.length} | Manual investigation required |`);
  }
  lines.push(`| **Total Excluded** | **${summary.totalUnmatched}** | |`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Helper to get the state of a resource for display
 */
function getResourceState(resource: AwsResource): string {
  switch (resource.service) {
    case 'ec2':
      return (resource as Ec2Resource).state;
    case 'rds':
      return (resource as RdsResource).status;
    case 'ecs': {
      const ecs = resource as EcsResource;
      if (ecs.resourceType === 'service') {
        return `runningCount=${(ecs as EcsServiceResource).runningCount}`;
      }
      return ecs.status;
    }
    case 'alb':
      return (resource as AlbResource).state;
    case 'nlb':
      return (resource as NlbResource).state;
    case 'elasticache':
      return (resource as ElastiCacheResource).status;
    default:
      return 'unknown';
  }
}

/**
 * Helper to render an exclusion table
 */
function renderExclusionTable(
  lines: string[],
  diagnostics: ResourceDiagnostic[],
  columns: { header: string; getter: (d: ResourceDiagnostic) => string }[]
): void {
  // Header
  lines.push('| ' + columns.map(c => c.header).join(' | ') + ' |');
  lines.push('|' + columns.map(() => '---').join('|') + '|');

  // Rows
  for (const d of diagnostics) {
    lines.push('| ' + columns.map(c => c.getter(d)).join(' | ') + ' |');
  }
}

/**
 * Filters discovered resources to only include those validated in CloudWatch
 */
export function filterValidatedResources(
  resources: DiscoveredResources,
  validationResults: readonly ServiceValidationResult[]
): DiscoveredResources {
  // Build a map of matched resources by service+region
  const matchedByServiceRegion = new Map<string, Set<string>>();

  for (const result of validationResults) {
    const key = `${result.service}-${result.region}`;
    const ids = new Set(result.matchedResources.map(r => r.id));
    matchedByServiceRegion.set(key, ids);
  }

  const filterByValidation = <T extends AwsResource>(
    items: readonly T[],
    service: AwsServiceType
  ): readonly T[] => {
    return items.filter(item => {
      const key = `${service}-${item.region}`;
      const matched = matchedByServiceRegion.get(key);
      return matched?.has(item.id) ?? false;
    });
  };

  return {
    ec2: filterByValidation(resources.ec2, 'ec2'),
    rds: filterByValidation(resources.rds, 'rds'),
    lambda: filterByValidation(resources.lambda, 'lambda'),
    ecs: filterByValidation(resources.ecs, 'ecs'),
    eks: filterByValidation(resources.eks, 'eks'),
    elasticache: filterByValidation(resources.elasticache, 'elasticache'),
    alb: filterByValidation(resources.alb, 'alb'),
    nlb: filterByValidation(resources.nlb, 'nlb'),
    apigateway: filterByValidation(resources.apigateway, 'apigateway'),
    s3: filterByValidation(resources.s3, 's3'),
    sqs: filterByValidation(resources.sqs, 'sqs'),
  };
}
