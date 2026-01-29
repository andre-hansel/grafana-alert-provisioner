export type AwsServiceType =
  | 'ec2'
  | 'rds'
  | 'lambda'
  | 'ecs'
  | 'eks'
  | 'elasticache'
  | 'alb'
  | 'nlb'
  | 'apigateway'
  | 's3'
  | 'sqs';

export interface AwsResourceTag {
  readonly key: string;
  readonly value: string;
}

export interface BaseAwsResource {
  readonly id: string;
  readonly arn: string;
  readonly name: string;
  readonly service: AwsServiceType;
  readonly region: string;
  readonly tags: readonly AwsResourceTag[];
}

export interface Ec2Resource extends BaseAwsResource {
  readonly service: 'ec2';
  readonly instanceType: string;
  readonly state: string;
  readonly vpcId?: string;
  readonly subnetId?: string;
  readonly privateIpAddress?: string;
  readonly publicIpAddress?: string;
}

export interface RdsResource extends BaseAwsResource {
  readonly service: 'rds';
  readonly engine: string;
  readonly engineVersion: string;
  readonly instanceClass: string;
  readonly allocatedStorage: number;
  readonly multiAz: boolean;
  readonly status: string;
  // Feature flags for conditional alerts
  readonly hasReadReplicas: boolean;
  readonly isReadReplica: boolean;
  readonly hasStorageAutoscaling: boolean;
  // Aurora-specific fields
  readonly isAurora: boolean;
  readonly clusterIdentifier?: string; // DBClusterIdentifier for Aurora
  readonly isServerless: boolean; // Aurora Serverless v2
}

export interface LambdaResource extends BaseAwsResource {
  readonly service: 'lambda';
  readonly runtime: string;
  readonly memorySize: number;
  readonly timeout: number;
  readonly handler: string;
  readonly lastModified: string;
  // Feature flags for conditional alerts
  readonly hasDlqConfigured: boolean;
  // Lambda@Edge detection (replicated functions for CloudFront)
  readonly isEdgeFunction: boolean;
}

export interface EcsClusterResource extends BaseAwsResource {
  readonly service: 'ecs';
  readonly resourceType: 'cluster';
  readonly status: string;
  readonly runningTasksCount: number;
  readonly pendingTasksCount: number;
  readonly activeServicesCount: number;
  // Container Insights enables detailed CloudWatch metrics
  readonly containerInsightsEnabled: boolean;
}

export interface EcsServiceResource extends BaseAwsResource {
  readonly service: 'ecs';
  readonly resourceType: 'service';
  readonly clusterArn: string;
  readonly clusterName: string;
  readonly status: string;
  readonly desiredCount: number;
  readonly runningCount: number;
  readonly launchType: string;
  // Feature flags for conditional alerts
  readonly hasAutoScaling: boolean;
  // Inherited from cluster - needed for diagnostics
  readonly containerInsightsEnabled: boolean;
}

export type EcsResource = EcsClusterResource | EcsServiceResource;

export interface EksResource extends BaseAwsResource {
  readonly service: 'eks';
  readonly version: string;
  readonly status: string;
  readonly platformVersion: string;
  readonly endpoint?: string;
}

export interface ElastiCacheResource extends BaseAwsResource {
  readonly service: 'elasticache';
  readonly engine: string;
  readonly engineVersion: string;
  readonly cacheNodeType: string;
  readonly numCacheNodes: number;
  readonly status: string;
  // Feature flags for conditional alerts
  readonly hasReplication: boolean;
}

export interface TargetHealthDetail {
  readonly targetId: string;
  readonly targetGroupArn: string;
  readonly state: 'healthy' | 'unhealthy' | 'draining' | 'unavailable' | 'unused' | 'initial';
  readonly reason?: string;
}

export interface LoadBalancerTargetHealth {
  readonly registeredTargetCount: number;
  readonly healthyTargetCount: number;
  readonly unhealthyTargetCount: number;
  readonly targetGroupCount: number;
  readonly details: readonly TargetHealthDetail[];
}

export interface AlbResource extends BaseAwsResource {
  readonly service: 'alb';
  readonly dnsName: string;
  readonly scheme: string;
  readonly vpcId: string;
  readonly state: string;
  readonly targetHealth?: LoadBalancerTargetHealth;
}

export interface NlbResource extends BaseAwsResource {
  readonly service: 'nlb';
  readonly dnsName: string;
  readonly scheme: string;
  readonly vpcId: string;
  readonly state: string;
  readonly targetHealth?: LoadBalancerTargetHealth;
}

export interface ApiGatewayResource extends BaseAwsResource {
  readonly service: 'apigateway';
  readonly description?: string;
  readonly createdDate: string;
  readonly apiKeySource?: string;
  readonly endpointConfiguration?: string;
}

export interface S3Resource extends BaseAwsResource {
  readonly service: 's3';
  readonly creationDate: string;
  readonly hasRequestMetrics: boolean;
}

export interface SqsResource extends BaseAwsResource {
  readonly service: 'sqs';
  readonly queueUrl: string;
  readonly isFifo: boolean;
  readonly visibilityTimeout?: number;
  readonly messageRetentionPeriod?: number;
  // Feature flags for conditional alerts
  readonly hasDlq: boolean;
}

export type AwsResource =
  | Ec2Resource
  | RdsResource
  | LambdaResource
  | EcsResource
  | EksResource
  | ElastiCacheResource
  | AlbResource
  | NlbResource
  | ApiGatewayResource
  | S3Resource
  | SqsResource;

export interface DiscoveredResources {
  readonly ec2: readonly Ec2Resource[];
  readonly rds: readonly RdsResource[];
  readonly lambda: readonly LambdaResource[];
  readonly ecs: readonly EcsResource[];
  readonly eks: readonly EksResource[];
  readonly elasticache: readonly ElastiCacheResource[];
  readonly alb: readonly AlbResource[];
  readonly nlb: readonly NlbResource[];
  readonly apigateway: readonly ApiGatewayResource[];
  readonly s3: readonly S3Resource[];
  readonly sqs: readonly SqsResource[];
}

export function createEmptyDiscoveredResources(): DiscoveredResources {
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

export function getTotalResourceCount(resources: DiscoveredResources): number {
  return (
    resources.ec2.length +
    resources.rds.length +
    resources.lambda.length +
    resources.ecs.length +
    resources.eks.length +
    resources.elasticache.length +
    resources.alb.length +
    resources.nlb.length +
    resources.apigateway.length +
    resources.s3.length +
    resources.sqs.length
  );
}

export function getResourcesByService(
  resources: DiscoveredResources,
  service: AwsServiceType
): readonly AwsResource[] {
  switch (service) {
    case 'ec2':
      return resources.ec2;
    case 'rds':
      return resources.rds;
    case 'lambda':
      return resources.lambda;
    case 'ecs':
      return resources.ecs;
    case 'eks':
      return resources.eks;
    case 'elasticache':
      return resources.elasticache;
    case 'alb':
      return resources.alb;
    case 'nlb':
      return resources.nlb;
    case 'apigateway':
      return resources.apigateway;
    case 's3':
      return resources.s3;
    case 'sqs':
      return resources.sqs;
  }
}
