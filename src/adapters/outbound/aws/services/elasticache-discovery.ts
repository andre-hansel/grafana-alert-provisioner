import {
  ElastiCacheClient,
  DescribeCacheClustersCommand,
  ListTagsForResourceCommand,
  type CacheCluster,
  type Tag,
} from '@aws-sdk/client-elasticache';
import type { ElastiCacheResource, AwsResourceTag } from '../../../../domain/entities/aws-resource.js';

export class ElastiCacheDiscoveryService {
  private client: ElastiCacheClient;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.client = new ElastiCacheClient({ region });
  }

  async discover(): Promise<readonly ElastiCacheResource[]> {
    const resources: ElastiCacheResource[] = [];
    let marker: string | undefined;

    do {
      const command = new DescribeCacheClustersCommand({
        Marker: marker,
        ShowCacheNodeInfo: true,
      });

      const response = await this.client.send(command);
      marker = response.Marker;

      for (const cluster of response.CacheClusters ?? []) {
        if (cluster.CacheClusterId && cluster.ARN) {
          const tags = await this.getTags(cluster.ARN);
          resources.push(this.mapCluster(cluster, tags));
        }
      }
    } while (marker);

    return resources;
  }

  private async getTags(arn: string): Promise<readonly AwsResourceTag[]> {
    try {
      const command = new ListTagsForResourceCommand({
        ResourceName: arn,
      });
      const response = await this.client.send(command);
      return this.mapTags(response.TagList);
    } catch {
      return [];
    }
  }

  private mapCluster(
    cluster: CacheCluster,
    tags: readonly AwsResourceTag[]
  ): ElastiCacheResource {
    const name = cluster.CacheClusterId ?? 'unknown';
    // Detect replication - either part of replication group or has multiple nodes
    const hasReplication = !!cluster.ReplicationGroupId || (cluster.NumCacheNodes ?? 0) > 1;

    return {
      id: name,
      arn: cluster.ARN ?? `arn:aws:elasticache:${this.region}:unknown:cluster:${name}`,
      name,
      service: 'elasticache',
      region: this.region,
      tags,
      engine: cluster.Engine ?? 'unknown',
      engineVersion: cluster.EngineVersion ?? 'unknown',
      cacheNodeType: cluster.CacheNodeType ?? 'unknown',
      numCacheNodes: cluster.NumCacheNodes ?? 0,
      status: cluster.CacheClusterStatus ?? 'unknown',
      hasReplication,
    };
  }

  private mapTags(tags: Tag[] | undefined): readonly AwsResourceTag[] {
    return (tags ?? [])
      .filter((t): t is Tag & { Key: string; Value: string } =>
        t.Key !== undefined && t.Value !== undefined
      )
      .map(t => ({ key: t.Key, value: t.Value }));
  }
}
