import {
  EKSClient,
  ListClustersCommand,
  DescribeClusterCommand,
  type Cluster,
} from '@aws-sdk/client-eks';
import type { EksResource, AwsResourceTag } from '../../../../domain/entities/aws-resource.js';

export class EksDiscoveryService {
  private client: EKSClient;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.client = new EKSClient({ region });
  }

  async discover(): Promise<readonly EksResource[]> {
    const clusterNames: string[] = [];
    let nextToken: string | undefined;

    do {
      const listCommand = new ListClustersCommand({
        nextToken,
      });

      const response = await this.client.send(listCommand);
      nextToken = response.nextToken;

      if (response.clusters) {
        clusterNames.push(...response.clusters);
      }
    } while (nextToken);

    const resources: EksResource[] = [];
    for (const name of clusterNames) {
      const cluster = await this.describeCluster(name);
      if (cluster) {
        resources.push(cluster);
      }
    }

    return resources;
  }

  private async describeCluster(name: string): Promise<EksResource | null> {
    try {
      const command = new DescribeClusterCommand({
        name,
      });

      const response = await this.client.send(command);
      if (response.cluster) {
        return this.mapCluster(response.cluster);
      }
      return null;
    } catch {
      return null;
    }
  }

  private mapCluster(cluster: Cluster): EksResource {
    const name = cluster.name ?? 'unknown';
    return {
      id: name,
      arn: cluster.arn ?? `arn:aws:eks:${this.region}:unknown:cluster/${name}`,
      name,
      service: 'eks',
      region: this.region,
      tags: this.mapTags(cluster.tags),
      version: cluster.version ?? 'unknown',
      status: cluster.status ?? 'unknown',
      platformVersion: cluster.platformVersion ?? 'unknown',
      endpoint: cluster.endpoint,
    };
  }

  private mapTags(tags: Record<string, string> | undefined): readonly AwsResourceTag[] {
    if (!tags) {
      return [];
    }
    return Object.entries(tags).map(([key, value]) => ({ key, value }));
  }
}
