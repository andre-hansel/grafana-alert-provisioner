import {
  RDSClient,
  DescribeDBInstancesCommand,
  DescribeDBClustersCommand,
  type DBInstance,
  type DBCluster,
  type Tag,
} from '@aws-sdk/client-rds';
import type { RdsResource, AwsResourceTag } from '../../../../domain/entities/aws-resource.js';

// Aurora engine prefixes
const AURORA_ENGINES = ['aurora', 'aurora-mysql', 'aurora-postgresql'];

export class RdsDiscoveryService {
  private client: RDSClient;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.client = new RDSClient({ region });
  }

  async discover(): Promise<readonly RdsResource[]> {
    // Discover both RDS instances and Aurora clusters in parallel
    const [instances, clusters] = await Promise.all([
      this.discoverInstances(),
      this.discoverClusters(),
    ]);

    // For Aurora, we prefer cluster-level monitoring (DBClusterIdentifier)
    // Filter out Aurora instances that are part of a cluster we already discovered
    const clusterIds = new Set(clusters.map(c => c.clusterIdentifier));
    const nonAuroraInstances = instances.filter(i => !i.isAurora || !i.clusterIdentifier || !clusterIds.has(i.clusterIdentifier));

    return [...nonAuroraInstances, ...clusters];
  }

  private async discoverInstances(): Promise<RdsResource[]> {
    const resources: RdsResource[] = [];
    let marker: string | undefined;

    do {
      const command = new DescribeDBInstancesCommand({
        Marker: marker,
      });

      const response = await this.client.send(command);
      marker = response.Marker;

      for (const instance of response.DBInstances ?? []) {
        if (instance.DBInstanceIdentifier) {
          resources.push(this.mapInstance(instance));
        }
      }
    } while (marker);

    return resources;
  }

  private async discoverClusters(): Promise<RdsResource[]> {
    const resources: RdsResource[] = [];
    let marker: string | undefined;

    do {
      const command = new DescribeDBClustersCommand({
        Marker: marker,
      });

      const response = await this.client.send(command);
      marker = response.Marker;

      for (const cluster of response.DBClusters ?? []) {
        if (cluster.DBClusterIdentifier) {
          resources.push(this.mapCluster(cluster));
        }
      }
    } while (marker);

    return resources;
  }

  private mapInstance(instance: DBInstance): RdsResource {
    // Detect replica configuration
    const hasReadReplicas = (instance.ReadReplicaDBInstanceIdentifiers?.length ?? 0) > 0;
    const isReadReplica = !!instance.ReadReplicaSourceDBInstanceIdentifier;

    // Detect storage autoscaling - if MaxAllocatedStorage is set and greater than current
    const hasStorageAutoscaling =
      !!instance.MaxAllocatedStorage &&
      instance.MaxAllocatedStorage > (instance.AllocatedStorage ?? 0);

    // Detect Aurora
    const engine = instance.Engine ?? 'unknown';
    const isAurora = AURORA_ENGINES.some(ae => engine.startsWith(ae));

    return {
      id: instance.DBInstanceIdentifier ?? 'unknown',
      arn: instance.DBInstanceArn ?? `arn:aws:rds:${this.region}:unknown:db:${instance.DBInstanceIdentifier}`,
      name: instance.DBInstanceIdentifier ?? 'unknown',
      service: 'rds',
      region: this.region,
      tags: this.mapTags(instance.TagList),
      engine,
      engineVersion: instance.EngineVersion ?? 'unknown',
      instanceClass: instance.DBInstanceClass ?? 'unknown',
      allocatedStorage: instance.AllocatedStorage ?? 0,
      multiAz: instance.MultiAZ ?? false,
      status: instance.DBInstanceStatus ?? 'unknown',
      hasReadReplicas,
      isReadReplica,
      hasStorageAutoscaling,
      isAurora,
      clusterIdentifier: instance.DBClusterIdentifier,
      isServerless: false,
    };
  }

  private mapCluster(cluster: DBCluster): RdsResource {
    const engine = cluster.Engine ?? 'unknown';
    const isServerless = cluster.ServerlessV2ScalingConfiguration !== undefined ||
      cluster.EngineMode === 'serverless';

    return {
      // For clusters, use the cluster identifier as the primary ID
      id: cluster.DBClusterIdentifier ?? 'unknown',
      arn: cluster.DBClusterArn ?? `arn:aws:rds:${this.region}:unknown:cluster:${cluster.DBClusterIdentifier}`,
      name: cluster.DBClusterIdentifier ?? 'unknown',
      service: 'rds',
      region: this.region,
      tags: this.mapTags(cluster.TagList),
      engine,
      engineVersion: cluster.EngineVersion ?? 'unknown',
      instanceClass: 'cluster', // Clusters don't have a single instance class
      allocatedStorage: cluster.AllocatedStorage ?? 0,
      multiAz: cluster.MultiAZ ?? false,
      status: cluster.Status ?? 'unknown',
      hasReadReplicas: (cluster.ReadReplicaIdentifiers?.length ?? 0) > 0,
      isReadReplica: !!cluster.ReplicationSourceIdentifier,
      hasStorageAutoscaling: false, // Aurora storage scales automatically
      isAurora: true,
      clusterIdentifier: cluster.DBClusterIdentifier,
      isServerless,
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
