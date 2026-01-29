import {
  ECSClient,
  ListClustersCommand,
  DescribeClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  type Cluster,
  type Service,
  type Tag,
} from '@aws-sdk/client-ecs';
import {
  ApplicationAutoScalingClient,
  DescribeScalableTargetsCommand,
  ServiceNamespace,
} from '@aws-sdk/client-application-auto-scaling';
import type {
  EcsClusterResource,
  EcsServiceResource,
  EcsResource,
  AwsResourceTag,
} from '../../../../domain/entities/aws-resource.js';

export class EcsDiscoveryService {
  private client: ECSClient;
  private autoScalingClient: ApplicationAutoScalingClient;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.client = new ECSClient({ region });
    this.autoScalingClient = new ApplicationAutoScalingClient({ region });
  }

  async discover(): Promise<readonly EcsResource[]> {
    const clusters = await this.discoverClusters();
    const services = await this.discoverServices(clusters);
    return [...clusters, ...services];
  }

  private async discoverClusters(): Promise<readonly EcsClusterResource[]> {
    const clusterArns: string[] = [];
    let nextToken: string | undefined;

    do {
      const listCommand = new ListClustersCommand({
        nextToken,
      });

      const response = await this.client.send(listCommand);
      nextToken = response.nextToken;

      if (response.clusterArns) {
        clusterArns.push(...response.clusterArns);
      }
    } while (nextToken);

    if (clusterArns.length === 0) {
      return [];
    }

    // Describe clusters in batches of 100
    const clusters: EcsClusterResource[] = [];
    for (let i = 0; i < clusterArns.length; i += 100) {
      const batch = clusterArns.slice(i, i + 100);
      const describeCommand = new DescribeClustersCommand({
        clusters: batch,
        include: ['TAGS', 'SETTINGS'],
      });

      const response = await this.client.send(describeCommand);
      for (const cluster of response.clusters ?? []) {
        if (cluster.clusterArn && cluster.clusterName) {
          clusters.push(this.mapCluster(cluster));
        }
      }
    }

    return clusters;
  }

  private async discoverServices(
    clusters: readonly EcsClusterResource[]
  ): Promise<readonly EcsServiceResource[]> {
    // Fetch all auto-scaling targets upfront for efficiency
    const autoScalingTargets = await this.getAutoScalingTargets();

    // Build a map of cluster ARN to Container Insights setting
    const clusterInsightsMap = new Map<string, boolean>();
    for (const cluster of clusters) {
      clusterInsightsMap.set(cluster.arn, cluster.containerInsightsEnabled);
    }

    const services: EcsServiceResource[] = [];

    for (const cluster of clusters) {
      const clusterServices = await this.discoverClusterServices(
        cluster.arn,
        cluster.name,
        cluster.containerInsightsEnabled,
        autoScalingTargets
      );
      services.push(...clusterServices);
    }

    return services;
  }

  private async discoverClusterServices(
    clusterArn: string,
    clusterName: string,
    containerInsightsEnabled: boolean,
    autoScalingTargets: Set<string>
  ): Promise<readonly EcsServiceResource[]> {
    const serviceArns: string[] = [];
    let nextToken: string | undefined;

    do {
      const listCommand = new ListServicesCommand({
        cluster: clusterArn,
        nextToken,
      });

      const response = await this.client.send(listCommand);
      nextToken = response.nextToken;

      if (response.serviceArns) {
        serviceArns.push(...response.serviceArns);
      }
    } while (nextToken);

    if (serviceArns.length === 0) {
      return [];
    }

    // Describe services in batches of 10
    const services: EcsServiceResource[] = [];
    for (let i = 0; i < serviceArns.length; i += 10) {
      const batch = serviceArns.slice(i, i + 10);
      const describeCommand = new DescribeServicesCommand({
        cluster: clusterArn,
        services: batch,
        include: ['TAGS'],
      });

      const response = await this.client.send(describeCommand);
      for (const service of response.services ?? []) {
        if (service.serviceArn && service.serviceName) {
          // Check if this service has auto-scaling configured
          const resourceId = this.buildAutoScalingResourceId(clusterArn, service.serviceName);
          const hasAutoScaling = autoScalingTargets.has(resourceId);
          services.push(this.mapService(service, clusterName, containerInsightsEnabled, hasAutoScaling));
        }
      }
    }

    return services;
  }

  private mapCluster(cluster: Cluster): EcsClusterResource {
    const name = cluster.clusterName ?? 'unknown';

    // Check if Container Insights is enabled
    const containerInsightsEnabled = cluster.settings?.some(
      setting => setting.name === 'containerInsights' && setting.value === 'enabled'
    ) ?? false;

    return {
      id: name,
      arn: cluster.clusterArn ?? `arn:aws:ecs:${this.region}:unknown:cluster/${name}`,
      name,
      service: 'ecs',
      resourceType: 'cluster',
      region: this.region,
      tags: this.mapTags(cluster.tags),
      status: cluster.status ?? 'unknown',
      runningTasksCount: cluster.runningTasksCount ?? 0,
      pendingTasksCount: cluster.pendingTasksCount ?? 0,
      activeServicesCount: cluster.activeServicesCount ?? 0,
      containerInsightsEnabled,
    };
  }

  private mapService(
    service: Service,
    clusterName: string,
    containerInsightsEnabled: boolean,
    hasAutoScaling: boolean
  ): EcsServiceResource {
    const name = service.serviceName ?? 'unknown';
    return {
      id: name,
      arn: service.serviceArn ?? `arn:aws:ecs:${this.region}:unknown:service/${name}`,
      name,
      service: 'ecs',
      resourceType: 'service',
      region: this.region,
      tags: this.mapTags(service.tags),
      clusterArn: service.clusterArn ?? 'unknown',
      clusterName,
      status: service.status ?? 'unknown',
      desiredCount: service.desiredCount ?? 0,
      runningCount: service.runningCount ?? 0,
      launchType: service.launchType ?? 'EC2',
      hasAutoScaling,
      containerInsightsEnabled,
    };
  }

  private mapTags(tags: Tag[] | undefined): readonly AwsResourceTag[] {
    return (tags ?? [])
      .filter((t): t is Tag & { key: string; value: string } =>
        t.key !== undefined && t.value !== undefined
      )
      .map(t => ({ key: t.key, value: t.value }));
  }

  /**
   * Get auto-scaling targets for ECS services.
   * Returns a Set of resource IDs (service/{cluster}/{service}) that have scaling configured.
   */
  private async getAutoScalingTargets(): Promise<Set<string>> {
    const scalableTargets = new Set<string>();
    let nextToken: string | undefined;

    try {
      do {
        const command = new DescribeScalableTargetsCommand({
          ServiceNamespace: ServiceNamespace.ECS,
          NextToken: nextToken,
        });

        const response = await this.autoScalingClient.send(command);
        nextToken = response.NextToken;

        for (const target of response.ScalableTargets ?? []) {
          if (target.ResourceId) {
            scalableTargets.add(target.ResourceId);
          }
        }
      } while (nextToken);
    } catch {
      // If we can't access auto-scaling info, assume none have it
    }

    return scalableTargets;
  }

  /**
   * Build the resource ID for Application Auto Scaling.
   * Format: service/{cluster-name}/{service-name}
   */
  private buildAutoScalingResourceId(clusterArn: string, serviceName: string): string {
    // Extract cluster name from ARN (e.g., arn:aws:ecs:us-east-1:123456789:cluster/my-cluster)
    const clusterName = clusterArn.split('/').pop() ?? clusterArn;
    return `service/${clusterName}/${serviceName}`;
  }
}
