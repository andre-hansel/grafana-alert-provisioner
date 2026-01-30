import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getWorkflowLogger } from '../workflow-logger.js';
import type {
  DiscoveredResources,
  AwsServiceType,
  RdsResource,
  LambdaResource,
  ElastiCacheResource,
  EcsServiceResource,
  SqsResource,
} from '../../../../domain/entities/aws-resource.js';
import type { AlertTemplate, TemplateMatch } from '../../../../domain/entities/template.js';
import { createTemplateMatcher } from '../../../../domain/services/template-matcher.js';
import type {
  AlertSelectionSummary,
  ImplementedAlert,
  SkippedAlert,
  ConditionalSkippedAlert,
} from '../../../../domain/services/cloudwatch-validator.js';

// Feature flags detected from resources
interface DetectedFeatures {
  rdsHasReplicas: boolean;
  auroraHasServerless: boolean;
  lambdaHasDlq: boolean;
  elasticacheHasReplication: boolean;
  ecsHasAutoScaling: boolean;
  sqsHasDlq: boolean;
}

export interface TemplateMatchingResult {
  matches: readonly TemplateMatch[];
  confirmed: boolean;
  alertSelectionSummary?: AlertSelectionSummary;
}

export async function runTemplateMatchingPrompt(
  resources: DiscoveredResources,
  templates: readonly AlertTemplate[]
): Promise<TemplateMatchingResult> {
  p.intro(pc.bgMagenta(pc.black(' Template Matching ')));

  const matcher = createTemplateMatcher();
  const result = matcher.matchTemplates({ templates, resources });

  if (result.matches.length === 0) {
    p.log.warn(pc.yellow('No templates matched the discovered resources.'));

    if (result.unmatchedTemplates.length > 0) {
      p.note(
        result.unmatchedTemplates.map(t => `- ${t.name} (${t.service})`).join('\n'),
        'Available Templates (no matching resources)'
      );
    }

    // Build alert selection summary for templates with no matching resources
    const noMatchingResources: SkippedAlert[] = result.unmatchedTemplates.map(t => ({
      template: t,
      reason: 'no_matching_resources' as const,
      reasonDetail: `No ${t.service} resources discovered`,
    }));

    const alertSelectionSummary: AlertSelectionSummary = {
      implementedAlerts: [],
      skippedAlerts: {
        noMatchingResources,
        featureNotDetected: [],
        tuningRequired: [],
        userDeselected: [],
      },
      totals: {
        implementedCount: 0,
        skippedCount: noMatchingResources.length,
        resourcesCovered: 0,
        regionsCount: 0,
      },
    };

    return { matches: [], confirmed: false, alertSelectionSummary };
  }

  // Detect features from resources
  const features = detectFeatures(resources);

  // Group matches by service for display
  const matchesByService = matcher.groupMatchesByService(result.matches);

  // Log template matching results
  const logger = getWorkflowLogger();
  logger.log('02-template-matching', {
    totalMatches: result.matches.length,
    unmatchedTemplates: result.unmatchedTemplates.map(t => ({ id: t.id, name: t.name, service: t.service })),
    detectedFeatures: features,
    matchesByService: Object.fromEntries(
      Array.from(matchesByService.entries()).map(([service, matches]) => [
        service,
        {
          matchCount: matches.length,
          templates: [...new Set(matches.map(m => m.template.id))],
          regions: [...new Set(matches.map(m => m.region))],
          resourceCount: new Set(matches.flatMap(m => m.resources.map(r => r.name))).size,
          matches: matches.map(m => ({
            templateId: m.template.id,
            templateName: m.template.name,
            region: m.region,
            resourceNames: m.resources.map(r => r.name),
          })),
        }
      ])
    ),
  });

  await displayMatchSummary(matchesByService, features);

  // Allow user to select which templates to use
  const allSelected = await selectTemplates(result.matches, matchesByService, features);

  if (!allSelected.confirmed) {
    return { matches: [], confirmed: false, alertSelectionSummary: allSelected.alertSelectionSummary };
  }

  return { matches: allSelected.selectedMatches, confirmed: true, alertSelectionSummary: allSelected.alertSelectionSummary };
}

function detectFeatures(resources: DiscoveredResources): DetectedFeatures {
  // Check RDS for replicas (includes Aurora)
  const rdsHasReplicas = resources.rds.some(
    (r: RdsResource) => r.hasReadReplicas || r.isReadReplica
  );

  // Check for Aurora Serverless v2
  const auroraHasServerless = resources.rds.some(
    (r: RdsResource) => r.isAurora && r.isServerless
  );

  // Check Lambda for DLQ
  const lambdaHasDlq = resources.lambda.some(
    (r: LambdaResource) => r.hasDlqConfigured
  );

  // Check ElastiCache for replication
  const elasticacheHasReplication = resources.elasticache.some(
    (r: ElastiCacheResource) => r.hasReplication
  );

  // Check ECS services for auto-scaling
  const ecsHasAutoScaling = resources.ecs.some(
    (r) => r.resourceType === 'service' && (r as EcsServiceResource).hasAutoScaling
  );

  // Check SQS for dead letter queues
  const sqsHasDlq = resources.sqs.some(
    (r: SqsResource) => r.hasDlq
  );

  return {
    rdsHasReplicas,
    auroraHasServerless,
    lambdaHasDlq,
    elasticacheHasReplication,
    ecsHasAutoScaling,
    sqsHasDlq,
  };
}

async function displayMatchSummary(
  matchesByService: Map<AwsServiceType, TemplateMatch[]>,
  features: DetectedFeatures
): Promise<void> {
  // Get all unique regions from matches
  const allRegions = new Set<string>();
  for (const matches of matchesByService.values()) {
    for (const match of matches) {
      if (match.region) {
        allRegions.add(match.region);
      }
    }
  }

  const regions = Array.from(allRegions).sort();

  // Always show the summary first
  displayMatchSummaryTable(matchesByService, features, regions);

  // For multi-region, offer drill-down
  if (regions.length > 1) {
    await browseMatchDetails(matchesByService, regions);
  }
}

function displayMatchSummaryTable(
  matchesByService: Map<AwsServiceType, TemplateMatch[]>,
  features: DetectedFeatures,
  regions: string[]
): void {
  const lines: string[] = [];

  // Find max service name length for padding
  const serviceColWidth = 14;

  // Count totals
  let totalRules = 0;
  let totalResources = new Set<string>();

  for (const [service, matches] of matchesByService) {
    const resourceNames = new Set<string>();
    for (const match of matches) {
      for (const resource of match.resources) {
        resourceNames.add(resource.name);
        totalResources.add(resource.name);
      }
    }
    totalRules += matches.length;

    // Service line with counts - pad service name for alignment
    const serviceName = service.toUpperCase().padEnd(serviceColWidth);
    const rulesLabel = matches.length === 1 ? 'rule' : 'rules';
    const resourcesLabel = resourceNames.size === 1 ? 'resource' : 'resources';
    const regionCount = new Set(matches.map(m => m.region)).size;
    const regionText = regions.length > 1 ? ` across ${regionCount} region${regionCount === 1 ? '' : 's'}` : '';

    lines.push(
      `${pc.cyan(pc.bold(serviceName))} ${matches.length} ${rulesLabel} covering ${resourceNames.size} ${resourcesLabel}${regionText}`
    );

    // Show detected features inline (indented to align with text after service name)
    const featureText = getFeatureText(service, features);
    if (featureText) {
      lines.push(`${''.padEnd(serviceColWidth)} ${pc.green('✓')} ${featureText}`);
    }
  }

  // Summary line
  lines.push('');
  lines.push(pc.bold(`Total: ${totalRules} alert rules covering ${totalResources.size} resources`));

  p.note(lines.join('\n'), 'Match Summary');
}

async function browseMatchDetails(
  matchesByService: Map<AwsServiceType, TemplateMatch[]>,
  regions: string[]
): Promise<void> {
  // Build region data
  const regionData = new Map<string, Map<AwsServiceType, TemplateMatch[]>>();
  for (const region of regions) {
    regionData.set(region, new Map());
  }

  for (const [service, matches] of matchesByService) {
    for (const match of matches) {
      const region = match.region ?? regions[0];
      const serviceMap = regionData.get(region);
      if (serviceMap) {
        if (!serviceMap.has(service)) {
          serviceMap.set(service, []);
        }
        serviceMap.get(service)!.push(match);
      }
    }
  }

  // Main browse loop
  while (true) {
    // Build region options with counts
    const regionOptions = regions
      .filter(region => {
        const serviceMap = regionData.get(region);
        return serviceMap && serviceMap.size > 0;
      })
      .map(region => {
        const serviceMap = regionData.get(region)!;
        let ruleCount = 0;
        for (const matches of serviceMap.values()) {
          ruleCount += matches.length;
        }
        return {
          value: region,
          label: `${region} ${pc.dim(`(${ruleCount} rules, ${serviceMap.size} services)`)}`,
        };
      });

    const choice = await p.select({
      message: 'View match details by region:',
      options: [
        { value: '_continue', label: pc.green('▶ Continue to template selection') },
        ...regionOptions,
      ],
    });

    if (p.isCancel(choice) || choice === '_continue') {
      return;
    }

    // User selected a region
    const selectedRegion = choice as string;
    const serviceMap = regionData.get(selectedRegion);
    if (!serviceMap) continue;

    await browseRegionMatches(selectedRegion, serviceMap);
  }
}

async function browseRegionMatches(
  region: string,
  serviceMatches: Map<AwsServiceType, TemplateMatch[]>
): Promise<void> {
  while (true) {
    // Build service options
    const serviceOptions = Array.from(serviceMatches.entries()).map(([service, matches]) => {
      const resourceCount = new Set(matches.flatMap(m => m.resources.map(r => r.name))).size;
      return {
        value: service,
        label: `${service.toUpperCase()} ${pc.dim(`(${matches.length} rules, ${resourceCount} resources)`)}`,
      };
    });

    const choice = await p.select({
      message: `${pc.cyan(region)} - Select service to view details:`,
      options: [
        { value: '_back', label: pc.yellow('← Back to regions') },
        ...serviceOptions,
      ],
    });

    if (p.isCancel(choice) || choice === '_back') {
      return;
    }

    // User selected a service
    const matches = serviceMatches.get(choice as AwsServiceType);
    if (!matches) continue;

    displayMatchDetails(region, choice as string, matches);
  }
}

function displayMatchDetails(region: string, serviceName: string, matches: TemplateMatch[]): void {
  const lines: string[] = [];

  // Group by template
  const byTemplate = new Map<string, TemplateMatch>();
  for (const match of matches) {
    byTemplate.set(match.template.id, match);
  }

  for (const [, match] of byTemplate) {
    lines.push(`${pc.bold(match.template.name)}`);
    lines.push(`  ${pc.dim(match.template.description ?? '')}`);
    lines.push(`  Severity: ${match.template.severity}`);

    // Show resources covered
    const resourceNames = match.resources.map(r => r.name);
    const maxShow = 5;
    const displayNames = resourceNames.slice(0, maxShow);
    lines.push(`  Resources (${resourceNames.length}):`);
    for (const name of displayNames) {
      lines.push(`    └─ ${name}`);
    }
    if (resourceNames.length > maxShow) {
      lines.push(`    └─ ${pc.dim(`... and ${resourceNames.length - maxShow} more`)}`);
    }
    lines.push('');
  }

  p.note(lines.join('\n'), `${serviceName.toUpperCase()} in ${region}`);
}

function getFeatureText(service: AwsServiceType, features: DetectedFeatures): string | null {
  if (service === 'rds' && features.rdsHasReplicas) {
    return 'Read replicas detected';
  }
  if (service === 'lambda' && features.lambdaHasDlq) {
    return 'DLQ configured on some functions';
  }
  if (service === 'elasticache' && features.elasticacheHasReplication) {
    return 'Replication detected';
  }
  if (service === 'ecs' && features.ecsHasAutoScaling) {
    return 'Auto-scaling configured on some services';
  }
  if (service === 'sqs' && features.sqsHasDlq) {
    return 'Dead letter queues configured';
  }
  return null;
}

interface SelectionResult {
  selectedMatches: readonly TemplateMatch[];
  confirmed: boolean;
  alertSelectionSummary: AlertSelectionSummary;
}

// Core templates - always selected by default (outages, critical failures)
const CORE_TEMPLATES = new Set([
  // ACM
  'acm-certificate-expiring-critical',

  // ALB
  'alb-unhealthy-hosts',
  'alb-no-healthy-hosts',
  'alb-5xx-errors',
  'alb-critical-target-5xx-errors',

  // API Gateway
  'apigateway-critical-5xx-errors',

  // Aurora
  'aurora-connectivity-loss',
  'aurora-critical-cpu',
  'aurora-critical-memory',
  'aurora-critical-replica-lag',
  'aurora-low-storage',

  // Auto Scaling
  'autoscaling-no-instances',

  // Backup
  'backup-job-failed',

  // CloudFront
  'cloudfront-critical-5xx-error-rate',

  // DocumentDB
  'documentdb-connectivity-loss',
  'documentdb-critical-cpu',
  'documentdb-critical-memory',

  // DynamoDB
  'dynamodb-system-errors',

  // EBS
  'ebs-critical-burst-balance',

  // EC2
  'ec2-critical-cpu',
  'ec2-status-check-failed',

  // ECS
  'ecs-critical-cpu',
  'ecs-critical-memory',

  // EFS
  'efs-critical-burst-credits',
  'efs-critical-io-limit',

  // EKS
  'eks-node-not-ready',

  // ElastiCache
  'elasticache-critical-cpu',
  'elasticache-critical-memory-usage',
  'elasticache-connectivity-loss',

  // EventBridge
  'eventbridge-critical-failed-invocations',

  // Firehose
  'firehose-s3-delivery-failures',

  // Kinesis
  'kinesis-critical-iterator-age',

  // Lambda
  'lambda-critical-errors',

  // MQ (ActiveMQ/RabbitMQ)
  'mq-critical-cpu',
  'mq-critical-heap-usage',
  'mq-critical-store-usage',
  'mq-no-consumers',

  // MSK (Kafka)
  'msk-critical-cpu',
  'msk-critical-disk-usage',
  'msk-offline-partitions',
  'msk-under-replicated-partitions',

  // NAT Gateway
  'natgateway-packets-dropped',
  'natgateway-port-allocation-errors',

  // Neptune
  'neptune-critical-cpu',
  'neptune-critical-memory',

  // NLB
  'nlb-unhealthy-hosts',
  'nlb-no-healthy-hosts',

  // RDS
  'rds-critical-cpu',
  'rds-critical-memory',
  'rds-low-storage',
  'rds-connectivity-loss',

  // Redshift
  'redshift-critical-cpu',
  'redshift-critical-disk-usage',
  'redshift-health-status',

  // Route53
  'route53-health-check-failed',

  // S3
  's3-5xx-errors',

  // SNS
  'sns-critical-notifications-failed',

  // Step Functions
  'stepfunctions-critical-executions-failed',

  // Transit Gateway
  'transitgateway-packets-dropped-blackhole',
  'transitgateway-packets-dropped-no-route',
]);

// Conditional templates - only selected if feature is detected
const CONDITIONAL_TEMPLATES: Record<string, keyof DetectedFeatures> = {
  'rds-critical-replica-lag': 'rdsHasReplicas',
  'aurora-critical-replica-lag': 'rdsHasReplicas',
  'aurora-serverless-acu-high': 'auroraHasServerless',
  'lambda-dead-letter-errors': 'lambdaHasDlq',
  'elasticache-critical-replication-lag': 'elasticacheHasReplication',
};

// Templates that need per-environment tuning (never auto-selected)
const TUNING_REQUIRED_TEMPLATES = new Set([
  // 4xx errors - client-caused, often not actionable
  'alb-4xx-errors',
  'apigateway-4xx-errors',
  's3-4xx-errors',
  'cloudfront-critical-error-rate',

  // TCP resets - need baseline to set threshold
  'nlb-tcp-client-resets',
  'nlb-tcp-target-resets',
  'nlb-tcp-elb-resets',

  // ECS task counts - need per-service desired count configuration
  'ecs-running-task-count',
  'ecs-pending-task-count',

  // Evictions - acceptable levels vary by application
  'elasticache-critical-evictions',

  // Rejected connections - needs baseline for traffic patterns
  'alb-rejected-connections',

  // Certificate warnings - depends on certificate management process
  'acm-certificate-expiring-soon',

  // Database transactions - needs baseline
  'aurora-blocked-transactions',
  'aurora-critical-deadlocks',
  'documentdb-cursors-timed-out',

  // Backup operations - depends on backup strategy
  'backup-copy-job-failed',
  'backup-restore-job-failed',

  // EBS metrics - workload dependent
  'ebs-consumed-iops',
  'ebs-critical-queue-length',
  'ebs-throughput-percentage',

  // EventBridge DLQ - depends on DLQ configuration
  'eventbridge-dead-letter-invocations',

  // Firehose destination-specific failures
  'firehose-elasticsearch-delivery-failures',
  'firehose-redshift-delivery-failures',

  // MSK controller - single value check, needs understanding
  'msk-active-controller',

  // NAT Gateway connections - needs baseline
  'natgateway-critical-connections',

  // Redshift maintenance - expected during maintenance windows
  'redshift-maintenance-mode',

  // Route53 timing metrics - need baseline
  'route53-connection-time',
  'route53-critical-health-check-degraded',
  'route53-ssl-handshake-time',
  'route53-time-to-first-byte',

  // Step Functions timeouts - depends on expected duration
  'stepfunctions-executions-timed-out',

  // SQS message age - threshold varies by use case (real-time vs batch)
  'sqs-message-age',
]);

function getDefaultTemplates(features: DetectedFeatures): Set<string> {
  const defaults = new Set(CORE_TEMPLATES);

  // Add conditional templates if features are detected
  for (const [templateId, featureKey] of Object.entries(CONDITIONAL_TEMPLATES)) {
    if (features[featureKey]) {
      defaults.add(templateId);
    }
  }

  return defaults;
}

async function selectTemplates(
  allMatches: readonly TemplateMatch[],
  matchesByService: Map<AwsServiceType, TemplateMatch[]>,
  features: DetectedFeatures
): Promise<SelectionResult> {
  // Group templates by service for selection
  const templatesByService = new Map<AwsServiceType, AlertTemplate[]>();

  for (const [service, matches] of matchesByService) {
    const uniqueTemplates = new Map<string, AlertTemplate>();
    for (const match of matches) {
      uniqueTemplates.set(match.template.id, match.template);
    }
    templatesByService.set(service, Array.from(uniqueTemplates.values()));
  }

  const selectedTemplateIds = new Set<string>();
  const defaultTemplates = getDefaultTemplates(features);

  // Debug logging - write to file for analysis
  const debugLog: string[] = [];
  debugLog.push('=== Template Matching Debug Log ===');
  debugLog.push(`Timestamp: ${new Date().toISOString()}`);
  debugLog.push('');
  debugLog.push('=== Detected Features ===');
  debugLog.push(JSON.stringify(features, null, 2));
  debugLog.push('');
  debugLog.push('=== CORE_TEMPLATES Set ===');
  debugLog.push(Array.from(CORE_TEMPLATES).join('\n'));
  debugLog.push('');
  debugLog.push('=== CONDITIONAL_TEMPLATES ===');
  debugLog.push(JSON.stringify(CONDITIONAL_TEMPLATES, null, 2));
  debugLog.push('');
  debugLog.push('=== TUNING_REQUIRED_TEMPLATES ===');
  debugLog.push(Array.from(TUNING_REQUIRED_TEMPLATES).join('\n'));
  debugLog.push('');
  debugLog.push('=== Default Templates (Core + Detected Conditionals) ===');
  debugLog.push(Array.from(defaultTemplates).join('\n'));
  debugLog.push('');
  debugLog.push('=== Template Classification ===');

  // For each service, let user select which templates to use
  for (const [service, templates] of templatesByService) {
    if (templates.length === 0) continue;

    debugLog.push(`\n--- ${service.toUpperCase()} ---`);

    const options = templates.map(t => {
      // Build hint with tier info - every template must have a tier
      let hint: string;
      let classification: string;
      const conditionalFeature = CONDITIONAL_TEMPLATES[t.id];
      const isCore = CORE_TEMPLATES.has(t.id);
      const isTuning = TUNING_REQUIRED_TEMPLATES.has(t.id);
      const isDefault = defaultTemplates.has(t.id);

      if (isCore) {
        hint = pc.green('[Core]');
        classification = 'CORE';
      } else if (conditionalFeature) {
        const detected = features[conditionalFeature];
        hint = detected ? pc.cyan('[Feature-Detected]') : pc.dim('[Feature-Not-Detected]');
        classification = detected ? 'FEATURE-DETECTED' : 'FEATURE-NOT-DETECTED';
      } else if (isTuning) {
        hint = pc.yellow('[Baseline-Required]');
        classification = 'BASELINE-REQUIRED';
      } else {
        // Uncategorized template - flag it visibly so we know to add it to a tier
        hint = pc.red('[Uncategorized]');
        classification = 'UNCATEGORIZED';
      }

      debugLog.push(`  ID: "${t.id}" (length: ${t.id.length}, chars: ${[...t.id].map(c => c.charCodeAt(0)).join(',')})`);
      debugLog.push(`    Name: ${t.name}`);
      debugLog.push(`    Classification: ${classification}`);
      debugLog.push(`    Is Default: ${isDefault}`);
      debugLog.push(`    In CORE_TEMPLATES: ${isCore}`);
      debugLog.push(`    In TUNING_REQUIRED: ${isTuning}`);
      debugLog.push(`    Hint shown: "${hint ? hint.replace(/\x1b\[[0-9;]*m/g, '') : '(none)'}"`);
      if (conditionalFeature) {
        debugLog.push(`    Conditional on: ${conditionalFeature} = ${features[conditionalFeature]}`);
      }

      return {
        value: t.id,
        label: `${t.name} ${hint}`,
      };
    });

    // Pre-select templates that are in defaults
    const defaultsForService = templates
      .filter(t => defaultTemplates.has(t.id))
      .map(t => t.id);

    const selected = await p.multiselect({
      message: `Select ${service.toUpperCase()} alert templates (space to toggle, enter to confirm):`,
      options,
      initialValues: defaultsForService,
      required: false,
    });

    if (p.isCancel(selected)) {
      // Build empty alert selection summary for cancelled selection
      const emptyAlertSelectionSummary = buildAlertSelectionSummary(
        allMatches,
        new Set<string>(),
        templatesByService,
        features
      );
      return { selectedMatches: [], confirmed: false, alertSelectionSummary: emptyAlertSelectionSummary };
    }

    for (const id of selected) {
      selectedTemplateIds.add(id);
    }
  }

  // Filter matches to only include selected templates
  const selectedMatches = allMatches.filter(m =>
    selectedTemplateIds.has(m.template.id)
  );

  // Build AlertSelectionSummary
  const alertSelectionSummary = buildAlertSelectionSummary(
    allMatches,
    selectedTemplateIds,
    templatesByService,
    features
  );

  // Log template selection
  const logger = getWorkflowLogger();
  logger.log('03-template-selection', {
    detectedFeatures: features,
    configuration: {
      coreTemplates: Array.from(CORE_TEMPLATES),
      conditionalTemplates: CONDITIONAL_TEMPLATES,
      tuningRequiredTemplates: Array.from(TUNING_REQUIRED_TEMPLATES),
    },
    defaultTemplates: Array.from(defaultTemplates),
    templateAnalysis: Object.fromEntries(
      Array.from(templatesByService.entries()).map(([service, templates]) => [
        service,
        templates.map(t => ({
          id: t.id,
          idLength: t.id.length,
          idCharCodes: [...t.id].map(c => c.charCodeAt(0)),
          name: t.name,
          severity: t.severity,
          classification: {
            isCore: CORE_TEMPLATES.has(t.id),
            isConditional: !!CONDITIONAL_TEMPLATES[t.id],
            conditionalFeature: CONDITIONAL_TEMPLATES[t.id] || null,
            isTuningRequired: TUNING_REQUIRED_TEMPLATES.has(t.id),
          },
          isDefault: defaultTemplates.has(t.id),
          wasSelected: selectedTemplateIds.has(t.id),
        }))
      ])
    ),
    selection: {
      selectedTemplateIds: Array.from(selectedTemplateIds),
      totalAlertRules: selectedMatches.length,
    },
    alertSelectionSummary: {
      implementedCount: alertSelectionSummary.totals.implementedCount,
      skippedCount: alertSelectionSummary.totals.skippedCount,
      resourcesCovered: alertSelectionSummary.totals.resourcesCovered,
      regionsCount: alertSelectionSummary.totals.regionsCount,
    },
    debugLog: debugLog,
  });
  p.log.info(`Selection logged to ${logger.getLogsDir()}`);

  p.log.info(`Selected ${selectedMatches.length} alert rules`);

  const confirmed = await p.confirm({
    message: 'Proceed with selected templates?',
    initialValue: true,
  });

  if (p.isCancel(confirmed)) {
    return { selectedMatches: [], confirmed: false, alertSelectionSummary };
  }

  return { selectedMatches, confirmed, alertSelectionSummary };
}

/**
 * Build the AlertSelectionSummary from selection results
 */
function buildAlertSelectionSummary(
  allMatches: readonly TemplateMatch[],
  selectedTemplateIds: Set<string>,
  templatesByService: Map<AwsServiceType, AlertTemplate[]>,
  features: DetectedFeatures
): AlertSelectionSummary {
  const implementedAlerts: ImplementedAlert[] = [];
  const skippedNoResources: SkippedAlert[] = [];
  const skippedFeatureNotDetected: ConditionalSkippedAlert[] = [];
  const skippedTuningRequired: SkippedAlert[] = [];
  const skippedUserDeselected: SkippedAlert[] = [];

  // Track all templates that have matches
  const templatesWithMatches = new Set<string>();
  for (const match of allMatches) {
    templatesWithMatches.add(match.template.id);
  }

  // Process templates that have matches
  for (const [_service, templates] of templatesByService) {
    for (const template of templates) {
      if (selectedTemplateIds.has(template.id)) {
        // Template is selected - build implemented alert
        const matches = allMatches.filter(m => m.template.id === template.id);
        const resourcesByRegion = new Map<string, string[]>();
        let totalResourceCount = 0;

        for (const match of matches) {
          const region = match.region;
          const existingResources = resourcesByRegion.get(region) ?? [];
          const newResources = match.resources.map(r => r.name);
          resourcesByRegion.set(region, [...existingResources, ...newResources]);
          totalResourceCount += match.resources.length;
        }

        implementedAlerts.push({
          template,
          resourcesByRegion,
          totalResourceCount,
        });
      } else {
        // Template not selected - determine why
        const conditionalFeature = CONDITIONAL_TEMPLATES[template.id];
        const isTuning = TUNING_REQUIRED_TEMPLATES.has(template.id);

        if (conditionalFeature && !features[conditionalFeature]) {
          // Feature not detected
          skippedFeatureNotDetected.push({
            template,
            reason: 'feature_not_detected',
            requiredFeature: getFeatureLabel(conditionalFeature),
            featureDetected: false,
          });
        } else if (isTuning) {
          // Tuning required
          skippedTuningRequired.push({
            template,
            reason: 'tuning_required',
            reasonDetail: getTuningReasonDetail(template.id),
          });
        } else {
          // User deselected
          skippedUserDeselected.push({
            template,
            reason: 'user_deselected',
          });
        }
      }
    }
  }

  // Calculate totals
  const allRegions = new Set<string>();
  const allResources = new Set<string>();
  for (const alert of implementedAlerts) {
    for (const [region, resources] of alert.resourcesByRegion) {
      allRegions.add(region);
      for (const r of resources) {
        allResources.add(`${region}:${r}`);
      }
    }
  }

  const totalSkipped = skippedNoResources.length + skippedFeatureNotDetected.length +
    skippedTuningRequired.length + skippedUserDeselected.length;

  return {
    implementedAlerts,
    skippedAlerts: {
      noMatchingResources: skippedNoResources,
      featureNotDetected: skippedFeatureNotDetected,
      tuningRequired: skippedTuningRequired,
      userDeselected: skippedUserDeselected,
    },
    totals: {
      implementedCount: implementedAlerts.length,
      skippedCount: totalSkipped,
      resourcesCovered: allResources.size,
      regionsCount: allRegions.size,
    },
  };
}

/**
 * Get human-readable label for a feature key
 */
function getFeatureLabel(featureKey: keyof DetectedFeatures): string {
  switch (featureKey) {
    case 'rdsHasReplicas':
      return 'RDS read replicas';
    case 'auroraHasServerless':
      return 'Aurora Serverless v2';
    case 'lambdaHasDlq':
      return 'Lambda DLQ configuration';
    case 'elasticacheHasReplication':
      return 'ElastiCache replication';
    case 'ecsHasAutoScaling':
      return 'ECS auto-scaling';
    case 'sqsHasDlq':
      return 'SQS dead letter queues';
    default:
      return featureKey;
  }
}

/**
 * Get reason detail for tuning-required templates
 */
function getTuningReasonDetail(templateId: string): string {
  const reasons: Record<string, string> = {
    'alb-4xx-errors': 'Client errors need baseline',
    'apigateway-4xx-errors': 'Client errors need baseline',
    's3-4xx-errors': 'Client errors need baseline',
    'cloudfront-critical-error-rate': 'Error rate needs baseline',
    'nlb-tcp-client-resets': 'TCP resets need baseline',
    'nlb-tcp-target-resets': 'TCP resets need baseline',
    'nlb-tcp-elb-resets': 'TCP resets need baseline',
    'ecs-running-task-count': 'Needs per-service desired count',
    'ecs-pending-task-count': 'Needs per-service desired count',
    'elasticache-critical-evictions': 'Acceptable levels vary by app',
    'alb-rejected-connections': 'Needs traffic baseline',
    'acm-certificate-expiring-soon': 'Depends on cert management process',
    'aurora-blocked-transactions': 'Needs transaction baseline',
    'aurora-critical-deadlocks': 'Needs deadlock baseline',
    'documentdb-cursors-timed-out': 'Needs cursor timeout baseline',
    'backup-copy-job-failed': 'Depends on backup strategy',
    'backup-restore-job-failed': 'Depends on backup strategy',
    'ebs-consumed-iops': 'Workload dependent',
    'ebs-critical-queue-length': 'Workload dependent',
    'ebs-throughput-percentage': 'Workload dependent',
    'eventbridge-dead-letter-invocations': 'Depends on DLQ configuration',
    'firehose-elasticsearch-delivery-failures': 'Destination-specific',
    'firehose-redshift-delivery-failures': 'Destination-specific',
    'msk-active-controller': 'Needs understanding of controller state',
    'natgateway-critical-connections': 'Needs connection baseline',
    'redshift-maintenance-mode': 'Expected during maintenance windows',
    'route53-connection-time': 'Needs timing baseline',
    'route53-critical-health-check-degraded': 'Needs timing baseline',
    'route53-ssl-handshake-time': 'Needs timing baseline',
    'route53-time-to-first-byte': 'Needs timing baseline',
    'stepfunctions-executions-timed-out': 'Depends on expected duration',
    'sqs-message-age': 'Threshold varies by use case',
  };
  return reasons[templateId] ?? 'Requires environment-specific threshold';
}
