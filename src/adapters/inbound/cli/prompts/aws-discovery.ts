import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { DiscoveredResources } from '../../../../domain/entities/aws-resource.js';
import { getTotalResourceCount } from '../../../../domain/entities/aws-resource.js';
import type { AwsDiscoveryPort } from '../../../../ports/outbound/aws-discovery-port.js';
import { getWorkflowLogger } from '../workflow-logger.js';

export interface AwsDiscoveryResult {
  resources: DiscoveredResources;
  regions: readonly string[];
  confirmed: boolean;
}

export async function runAwsDiscoveryPrompt(
  awsDiscovery: AwsDiscoveryPort,
  regions: readonly string[]
): Promise<AwsDiscoveryResult> {
  p.intro(pc.bgYellow(pc.black(' AWS Discovery ')));

  // Validate credentials first
  const credentialsSpinner = p.spinner();
  credentialsSpinner.start('Validating AWS credentials...');

  const credentialsStatus = await awsDiscovery.validateCredentials();

  if (!credentialsStatus.valid) {
    credentialsSpinner.stop('AWS credentials invalid or missing');
    p.log.error(pc.red(credentialsStatus.error ?? 'Invalid credentials'));

    // Offer to enter credentials
    const enterCreds = await p.confirm({
      message: 'Would you like to enter AWS credentials now?',
      initialValue: true,
    });

    if (p.isCancel(enterCreds) || !enterCreds) {
      p.note(
        [
          'To set credentials externally:',
          '',
          '1. Run: aws sso login --profile your-profile',
          '2. Export credentials:',
          '   export AWS_ACCESS_KEY_ID=...',
          '   export AWS_SECRET_ACCESS_KEY=...',
          '   export AWS_SESSION_TOKEN=...',
        ].join('\n'),
        'Credentials Help'
      );

      return {
        resources: createEmptyResources(),
        regions,
        confirmed: false,
      };
    }

    // Prompt for credentials
    const credentialsResult = await promptForCredentials();
    if (!credentialsResult.entered) {
      return {
        resources: createEmptyResources(),
        regions,
        confirmed: false,
      };
    }

    // Set credentials in environment
    process.env.AWS_ACCESS_KEY_ID = credentialsResult.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentialsResult.secretAccessKey;
    if (credentialsResult.sessionToken) {
      process.env.AWS_SESSION_TOKEN = credentialsResult.sessionToken;
    }

    // Re-validate
    const retrySpinner = p.spinner();
    retrySpinner.start('Validating entered credentials...');
    const retryStatus = await awsDiscovery.validateCredentials();

    if (!retryStatus.valid) {
      retrySpinner.stop('Credentials still invalid');
      p.log.error(pc.red(retryStatus.error ?? 'Invalid credentials'));
      return {
        resources: createEmptyResources(),
        regions,
        confirmed: false,
      };
    }

    retrySpinner.stop(
      `Credentials valid ${pc.dim(`(Account: ${retryStatus.accountId})`)}`
    );
  }

  credentialsSpinner.stop(
    `Credentials valid ${pc.dim(`(Account: ${credentialsStatus.accountId})`)}`
  );

  // Run discovery for all regions in parallel
  const discoverySpinner = p.spinner();

  // Track progress across all regions
  const regionProgress = new Map<string, { current: string; done: boolean }>();
  for (const region of regions) {
    regionProgress.set(region, { current: 'starting', done: false });
  }

  const updateSpinner = () => {
    const inProgress = [...regionProgress.entries()]
      .filter(([, status]) => !status.done)
      .map(([region, status]) => `${region}:${status.current}`);

    const doneCount = [...regionProgress.values()].filter(s => s.done).length;

    if (inProgress.length > 0) {
      discoverySpinner.message(`[${doneCount}/${regions.length}] ${inProgress.slice(0, 2).join(', ')}${inProgress.length > 2 ? '...' : ''}`);
    }
  };

  discoverySpinner.start(`Scanning ${regions.length} region${regions.length > 1 ? 's' : ''} in parallel...`);

  // Discover resources in all regions in parallel
  const regionPromises = regions.map(async region => {
    const regionResources = await awsDiscovery.discoverResources({
      region,
      onProgress: (progress) => {
        if (progress.status === 'in_progress') {
          regionProgress.set(region, { current: progress.service, done: false });
          updateSpinner();
        }
      },
    });

    regionProgress.set(region, { current: 'done', done: true });
    updateSpinner();

    return regionResources;
  });

  const regionResults = await Promise.all(regionPromises);

  // Merge all results
  const allResources = createEmptyResources();
  for (const regionResources of regionResults) {
    mergeResources(allResources, regionResources);
  }

  const totalCount = getTotalResourceCount(allResources);
  discoverySpinner.stop(`Discovery complete: ${totalCount} resources found across ${regions.length} region${regions.length > 1 ? 's' : ''}`);

  // Log discovery results
  const logger = getWorkflowLogger();
  logger.log('01-aws-discovery', {
    regions,
    totalResources: totalCount,
    resourcesByService: {
      ec2: { count: allResources.ec2.length, resources: allResources.ec2.map(r => ({ name: r.name, region: r.region, state: r.state })) },
      rds: { count: allResources.rds.length, resources: allResources.rds.map(r => ({ name: r.name, region: r.region, engine: r.engine, hasReadReplicas: r.hasReadReplicas, isReadReplica: r.isReadReplica, hasStorageAutoscaling: r.hasStorageAutoscaling })) },
      lambda: { count: allResources.lambda.length, resources: allResources.lambda.map(r => ({ name: r.name, region: r.region, runtime: r.runtime, hasDlqConfigured: r.hasDlqConfigured })) },
      ecs: { count: allResources.ecs.length, resources: allResources.ecs.map(r => ({ name: r.name, region: r.region, resourceType: r.resourceType, ...(r.resourceType === 'service' ? { hasAutoScaling: (r as any).hasAutoScaling } : {}) })) },
      eks: { count: allResources.eks.length, resources: allResources.eks.map(r => ({ name: r.name, region: r.region })) },
      elasticache: { count: allResources.elasticache.length, resources: allResources.elasticache.map(r => ({ name: r.name, region: r.region, engine: r.engine, hasReplication: r.hasReplication })) },
      alb: { count: allResources.alb.length, resources: allResources.alb.map(r => ({ name: r.name, region: r.region })) },
      nlb: { count: allResources.nlb.length, resources: allResources.nlb.map(r => ({ name: r.name, region: r.region })) },
      apigateway: { count: allResources.apigateway.length, resources: allResources.apigateway.map(r => ({ name: r.name, region: r.region })) },
      s3: { count: allResources.s3.length, resources: allResources.s3.map(r => ({ name: r.name, region: r.region, hasRequestMetrics: r.hasRequestMetrics })) },
      sqs: { count: allResources.sqs.length, resources: allResources.sqs.map(r => ({ name: r.name, region: r.region, isFifo: r.isFifo, hasDlq: r.hasDlq })) },
    },
    featureSummary: {
      rdsHasReplicas: allResources.rds.some(r => r.hasReadReplicas || r.isReadReplica),
      lambdaHasDlq: allResources.lambda.some(r => r.hasDlqConfigured),
      elasticacheHasReplication: allResources.elasticache.some(r => r.hasReplication),
      ecsHasAutoScaling: allResources.ecs.some(r => r.resourceType === 'service' && (r as any).hasAutoScaling),
      sqsHasDlq: allResources.sqs.some(r => r.hasDlq),
    },
  });
  p.log.info(`Discovery logged to ${logger.getLogsDir()}`);

  // Display results as tree (with optional drill-down for multi-region)
  await displayResourceTree(allResources, regions);

  if (totalCount === 0) {
    p.log.warn(pc.yellow('No resources found in the selected regions.'));
    const proceed = await p.confirm({
      message: 'Continue anyway?',
      initialValue: false,
    });

    if (p.isCancel(proceed) || !proceed) {
      return { resources: allResources, regions, confirmed: false };
    }
  }

  const confirmed = await p.confirm({
    message: `Proceed with ${totalCount} discovered resources?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed)) {
    return { resources: allResources, regions, confirmed: false };
  }

  return { resources: allResources, regions, confirmed };
}

async function displayResourceTree(resources: DiscoveredResources, regions: readonly string[]): Promise<void> {
  // If single region, use simple display (no drill-down needed)
  if (regions.length === 1 && regions[0]) {
    displaySingleRegionResources(resources, regions[0]);
    return;
  }

  // Multi-region: show summary table first
  displayMultiRegionSummary(resources, regions);

  // Then offer drill-down into details
  await browseResourceDetails(resources, regions);
}

function displaySingleRegionResources(resources: DiscoveredResources, region: string): void {
  const lines: string[] = [`${pc.bold('Discovered Resources')} ${pc.dim(`(${region})`)}`];

  const services = getServiceSummaries(resources);

  for (const service of services) {
    if (service.count > 0) {
      lines.push('');
      lines.push(`${pc.cyan(service.name)} ${pc.dim(`(${service.count})`)}`);
      const displayItems = service.items.slice(0, 5);
      for (const item of displayItems) {
        lines.push(`  └─ ${item}`);
      }
      if (service.items.length > 5) {
        lines.push(`  └─ ${pc.dim(`... and ${service.items.length - 5} more`)}`);
      }
    }
  }

  p.note(lines.join('\n'), '');
}

function displayMultiRegionSummary(resources: DiscoveredResources, regions: readonly string[]): void {
  // Group resources by region
  const resourcesByRegion = new Map<string, Map<string, number>>();

  for (const region of regions) {
    resourcesByRegion.set(region, new Map());
  }

  // Count resources per service per region
  const allResources = [
    { name: 'EC2', items: resources.ec2 },
    { name: 'RDS', items: resources.rds },
    { name: 'Lambda', items: resources.lambda },
    { name: 'ECS', items: resources.ecs },
    { name: 'EKS', items: resources.eks },
    { name: 'ElastiCache', items: resources.elasticache },
    { name: 'ALB', items: resources.alb },
    { name: 'NLB', items: resources.nlb },
    { name: 'API Gateway', items: resources.apigateway },
    { name: 'S3', items: resources.s3 },
    { name: 'SQS', items: resources.sqs },
  ];

  for (const { name, items } of allResources) {
    for (const item of items) {
      const regionMap = resourcesByRegion.get(item.region);
      if (regionMap) {
        regionMap.set(name, (regionMap.get(name) ?? 0) + 1);
      }
    }
  }

  // Get services that have any resources
  const servicesWithResources = allResources
    .filter(s => s.items.length > 0)
    .map(s => s.name);

  if (servicesWithResources.length === 0) {
    p.note('No resources found', 'Discovered Resources');
    return;
  }

  // Build column display - pad first, then colorize to keep alignment
  const colWidth = 12;
  const serviceColWidth = 14;
  const lines: string[] = [];

  // Helper to right-pad a cell value
  const rightAlign = (value: string, width: number) => value.padStart(width);

  // Header row with region names
  let header = pc.bold('Service'.padEnd(serviceColWidth));
  for (const region of regions) {
    header += pc.cyan(rightAlign(region, colWidth));
  }
  header += pc.cyan(rightAlign('Total', colWidth));
  lines.push(header);

  // Separator
  lines.push('─'.repeat(serviceColWidth + (regions.length + 1) * colWidth));

  // Data rows
  for (const serviceName of servicesWithResources) {
    let row = serviceName.padEnd(serviceColWidth);
    let total = 0;

    for (const region of regions) {
      const count = resourcesByRegion.get(region)?.get(serviceName) ?? 0;
      total += count;
      // Pad first, then colorize
      const padded = rightAlign(count > 0 ? count.toString() : '-', colWidth);
      row += count > 0 ? padded : pc.dim(padded);
    }

    row += pc.bold(rightAlign(total.toString(), colWidth));
    lines.push(row);
  }

  // Total row
  lines.push('─'.repeat(serviceColWidth + (regions.length + 1) * colWidth));
  let totalRow = pc.bold('TOTAL'.padEnd(serviceColWidth));
  let grandTotal = 0;

  for (const region of regions) {
    const regionMap = resourcesByRegion.get(region);
    let regionTotal = 0;
    if (regionMap) {
      for (const count of regionMap.values()) {
        regionTotal += count;
      }
    }
    grandTotal += regionTotal;
    totalRow += pc.bold(rightAlign(regionTotal.toString(), colWidth));
  }
  totalRow += pc.bold(pc.green(rightAlign(grandTotal.toString(), colWidth)));
  lines.push(totalRow);

  p.note(lines.join('\n'), 'Discovered Resources by Region');
}

function getServiceSummaries(resources: DiscoveredResources): Array<{ name: string; count: number; items: string[] }> {
  return [
    { name: 'EC2', count: resources.ec2.length, items: resources.ec2.map(r => r.name) },
    { name: 'RDS', count: resources.rds.length, items: resources.rds.map(r => r.name) },
    { name: 'Lambda', count: resources.lambda.length, items: resources.lambda.map(r => r.name) },
    { name: 'ECS', count: resources.ecs.length, items: resources.ecs.map(r => r.name) },
    { name: 'EKS', count: resources.eks.length, items: resources.eks.map(r => r.name) },
    { name: 'ElastiCache', count: resources.elasticache.length, items: resources.elasticache.map(r => r.name) },
    { name: 'ALB', count: resources.alb.length, items: resources.alb.map(r => r.name) },
    { name: 'NLB', count: resources.nlb.length, items: resources.nlb.map(r => r.name) },
    { name: 'API Gateway', count: resources.apigateway.length, items: resources.apigateway.map(r => r.name) },
    { name: 'S3', count: resources.s3.length, items: resources.s3.map(r => r.name) },
    { name: 'SQS', count: resources.sqs.length, items: resources.sqs.map(r => r.name) },
  ];
}

interface ResourcesByRegion {
  region: string;
  services: Array<{ name: string; resources: string[] }>;
  total: number;
}

function getResourcesByRegion(resources: DiscoveredResources, regions: readonly string[]): ResourcesByRegion[] {
  const allResources = [
    { name: 'EC2', items: resources.ec2 },
    { name: 'RDS', items: resources.rds },
    { name: 'Lambda', items: resources.lambda },
    { name: 'ECS', items: resources.ecs },
    { name: 'EKS', items: resources.eks },
    { name: 'ElastiCache', items: resources.elasticache },
    { name: 'ALB', items: resources.alb },
    { name: 'NLB', items: resources.nlb },
    { name: 'API Gateway', items: resources.apigateway },
    { name: 'S3', items: resources.s3 },
    { name: 'SQS', items: resources.sqs },
  ];

  return regions.map(region => {
    const services: Array<{ name: string; resources: string[] }> = [];
    let total = 0;

    for (const { name, items } of allResources) {
      const regionItems = items.filter(item => item.region === region);
      if (regionItems.length > 0) {
        services.push({ name, resources: regionItems.map(r => r.name) });
        total += regionItems.length;
      }
    }

    return { region, services, total };
  }).filter(r => r.total > 0);
}

async function browseResourceDetails(resources: DiscoveredResources, regions: readonly string[]): Promise<void> {
  const resourcesByRegion = getResourcesByRegion(resources, regions);

  // Main browse loop
  while (true) {
    // Build region options
    const regionOptions = resourcesByRegion.map(r => ({
      value: r.region,
      label: `${r.region} ${pc.dim(`(${r.total} resources, ${r.services.length} services)`)}`,
    }));

    const regionChoice = await p.select({
      message: 'Browse resource details:',
      options: [
        { value: '_continue', label: pc.green('▶ Continue to template matching') },
        ...regionOptions,
      ],
    });

    if (p.isCancel(regionChoice) || regionChoice === '_continue') {
      return;
    }

    // User selected a region - show services in that region
    const selectedRegion = resourcesByRegion.find(r => r.region === regionChoice);
    if (!selectedRegion) continue;

    await browseRegionServices(selectedRegion);
  }
}

async function browseRegionServices(regionData: ResourcesByRegion): Promise<void> {
  while (true) {
    // Build service options
    const serviceOptions = regionData.services.map(s => ({
      value: s.name,
      label: `${s.name} ${pc.dim(`(${s.resources.length})`)}`,
    }));

    const serviceChoice = await p.select({
      message: `${pc.cyan(regionData.region)} - Select service to view resources:`,
      options: [
        { value: '_back', label: pc.yellow('← Back to regions') },
        ...serviceOptions,
      ],
    });

    if (p.isCancel(serviceChoice) || serviceChoice === '_back') {
      return;
    }

    // User selected a service - show resources
    const selectedService = regionData.services.find(s => s.name === serviceChoice);
    if (!selectedService) continue;

    displayServiceResources(regionData.region, selectedService.name, selectedService.resources);
  }
}

function displayServiceResources(region: string, serviceName: string, resourceNames: string[]): void {
  const lines: string[] = [];

  // Show all resources (or paginate if too many)
  const maxDisplay = 20;
  const displayItems = resourceNames.slice(0, maxDisplay);

  for (const name of displayItems) {
    lines.push(`  └─ ${name}`);
  }

  if (resourceNames.length > maxDisplay) {
    lines.push(`  └─ ${pc.dim(`... and ${resourceNames.length - maxDisplay} more`)}`);
  }

  p.note(lines.join('\n'), `${serviceName} in ${region} (${resourceNames.length})`);
}

function createEmptyResources(): DiscoveredResources {
  return {
    ec2: [],
    rds: [],
    lambda: [],
    ecs: [],
    eks: [],
    elasticache: [],
    alb: [],
    nlb: [],
    apigateway: [],
    s3: [],
    sqs: [],
  };
}

interface CredentialsInput {
  entered: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

async function promptForCredentials(): Promise<CredentialsInput> {
  p.note(
    [
      'Paste your AWS credentials from the AWS console.',
      'Copy all three export lines and paste them here, then press Enter.',
      pc.dim('Credentials are stored in memory only for this session.'),
    ].join('\n'),
    'AWS Credentials'
  );

  const input = await p.text({
    message: 'Paste credentials (then press Enter):',
    placeholder: 'export AWS_ACCESS_KEY_ID=...',
    validate: value => {
      if (!value || value.trim().length === 0) {
        return 'Credentials are required';
      }
      const parsed = parseExportCommands(value);
      if (!parsed.accessKeyId) {
        return 'Could not find AWS_ACCESS_KEY_ID in input';
      }
      if (!parsed.secretAccessKey) {
        return 'Could not find AWS_SECRET_ACCESS_KEY in input';
      }
      if (!parsed.sessionToken) {
        return 'Could not find AWS_SESSION_TOKEN in input';
      }
      return undefined;
    },
  });

  if (p.isCancel(input)) {
    return { entered: false };
  }

  const parsed = parseExportCommands(input);

  return {
    entered: true,
    accessKeyId: parsed.accessKeyId,
    secretAccessKey: parsed.secretAccessKey,
    sessionToken: parsed.sessionToken,
  };
}

function parseExportCommands(input: string): {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
} {
  const result: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  } = {};

  // Match export VAR="value" or export VAR=value patterns
  // Also handles VAR="value" without export
  const patterns = [
    { key: 'accessKeyId', regex: /(?:export\s+)?AWS_ACCESS_KEY_ID=["']?([^"'\s]+)["']?/i },
    { key: 'secretAccessKey', regex: /(?:export\s+)?AWS_SECRET_ACCESS_KEY=["']?([^"'\s]+)["']?/i },
    { key: 'sessionToken', regex: /(?:export\s+)?AWS_SESSION_TOKEN=["']?([^"'\s]+)["']?/i },
  ];

  for (const { key, regex } of patterns) {
    const match = input.match(regex);
    if (match && match[1]) {
      result[key as keyof typeof result] = match[1];
    }
  }

  return result;
}

function mergeResources(target: DiscoveredResources, source: DiscoveredResources): void {
  // TypeScript doesn't allow direct mutation of readonly arrays,
  // so we need to work around this for the merging logic
  const mutable = target as {
    ec2: typeof target.ec2 extends readonly (infer T)[] ? T[] : never;
    rds: typeof target.rds extends readonly (infer T)[] ? T[] : never;
    lambda: typeof target.lambda extends readonly (infer T)[] ? T[] : never;
    ecs: typeof target.ecs extends readonly (infer T)[] ? T[] : never;
    eks: typeof target.eks extends readonly (infer T)[] ? T[] : never;
    elasticache: typeof target.elasticache extends readonly (infer T)[] ? T[] : never;
    alb: typeof target.alb extends readonly (infer T)[] ? T[] : never;
    nlb: typeof target.nlb extends readonly (infer T)[] ? T[] : never;
    apigateway: typeof target.apigateway extends readonly (infer T)[] ? T[] : never;
    s3: typeof target.s3 extends readonly (infer T)[] ? T[] : never;
    sqs: typeof target.sqs extends readonly (infer T)[] ? T[] : never;
  };

  mutable.ec2.push(...source.ec2);
  mutable.rds.push(...source.rds);
  mutable.lambda.push(...source.lambda);
  mutable.ecs.push(...source.ecs);
  mutable.eks.push(...source.eks);
  mutable.elasticache.push(...source.elasticache);
  mutable.alb.push(...source.alb);
  mutable.nlb.push(...source.nlb);
  mutable.apigateway.push(...source.apigateway);
  mutable.s3.push(...source.s3);
  mutable.sqs.push(...source.sqs);
}
