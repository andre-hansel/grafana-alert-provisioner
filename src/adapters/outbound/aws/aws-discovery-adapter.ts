import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import type {
  AwsDiscoveryPort,
  AwsCredentialsStatus,
  DiscoveryOptions,
} from '../../../ports/outbound/aws-discovery-port.js';
import type {
  DiscoveredResources,
  AwsServiceType,
} from '../../../domain/entities/aws-resource.js';
import { createEmptyDiscoveredResources } from '../../../domain/entities/aws-resource.js';

import { Ec2DiscoveryService } from './services/ec2-discovery.js';
import { RdsDiscoveryService } from './services/rds-discovery.js';
import { LambdaDiscoveryService } from './services/lambda-discovery.js';
import { EcsDiscoveryService } from './services/ecs-discovery.js';
import { EksDiscoveryService } from './services/eks-discovery.js';
import { ElastiCacheDiscoveryService } from './services/elasticache-discovery.js';
import { ElbDiscoveryService } from './services/elb-discovery.js';
import { ApiGatewayDiscoveryService } from './services/apigateway-discovery.js';
import { S3DiscoveryService } from './services/s3-discovery.js';
import { SqsDiscoveryService } from './services/sqs-discovery.js';

const SUPPORTED_SERVICES: readonly AwsServiceType[] = [
  'ec2',
  'rds',
  'lambda',
  'ecs',
  'eks',
  'elasticache',
  'alb',
  'nlb',
  'apigateway',
  's3',
  'sqs',
];

export class AwsDiscoveryAdapter implements AwsDiscoveryPort {
  async validateCredentials(): Promise<AwsCredentialsStatus> {
    const hasEnvVars =
      !!process.env['AWS_ACCESS_KEY_ID'] &&
      !!process.env['AWS_SECRET_ACCESS_KEY'];

    if (!hasEnvVars) {
      return {
        valid: false,
        error:
          'AWS credentials not found. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.',
      };
    }

    try {
      const client = new STSClient({});
      const command = new GetCallerIdentityCommand({});
      const response = await client.send(command);

      return {
        valid: true,
        accountId: response.Account,
        userId: response.UserId,
        arn: response.Arn,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        error: `AWS credentials are invalid or expired: ${errorMessage}`,
      };
    }
  }

  async discoverResources(options: DiscoveryOptions): Promise<DiscoveredResources> {
    const { region, services = SUPPORTED_SERVICES, onProgress } = options;
    const results = createEmptyDiscoveredResources();

    for (const service of services) {
      if (onProgress) {
        onProgress({ service, status: 'in_progress' });
      }

      try {
        const serviceResults = await this.discoverService(service, region);
        this.mergeResults(results, serviceResults);

        if (onProgress) {
          const count = this.getServiceResourceCount(serviceResults, service);
          onProgress({ service, status: 'completed', resourceCount: count });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (onProgress) {
          onProgress({ service, status: 'error', error: errorMessage });
        }
      }
    }

    return results;
  }

  async discoverService(
    service: AwsServiceType,
    region: string
  ): Promise<DiscoveredResources> {
    const results = createEmptyDiscoveredResources();

    switch (service) {
      case 'ec2': {
        const discovery = new Ec2DiscoveryService(region);
        const ec2Resources = await discovery.discover();
        return { ...results, ec2: ec2Resources };
      }
      case 'rds': {
        const discovery = new RdsDiscoveryService(region);
        const rdsResources = await discovery.discover();
        return { ...results, rds: rdsResources };
      }
      case 'lambda': {
        const discovery = new LambdaDiscoveryService(region);
        const lambdaResources = await discovery.discover();
        return { ...results, lambda: lambdaResources };
      }
      case 'ecs': {
        const discovery = new EcsDiscoveryService(region);
        const ecsResources = await discovery.discover();
        return { ...results, ecs: ecsResources };
      }
      case 'eks': {
        const discovery = new EksDiscoveryService(region);
        const eksResources = await discovery.discover();
        return { ...results, eks: eksResources };
      }
      case 'elasticache': {
        const discovery = new ElastiCacheDiscoveryService(region);
        const elasticacheResources = await discovery.discover();
        return { ...results, elasticache: elasticacheResources };
      }
      case 'alb': {
        const discovery = new ElbDiscoveryService(region);
        const albResources = await discovery.discoverAlbs();
        return { ...results, alb: albResources };
      }
      case 'nlb': {
        const discovery = new ElbDiscoveryService(region);
        const nlbResources = await discovery.discoverNlbs();
        return { ...results, nlb: nlbResources };
      }
      case 'apigateway': {
        const discovery = new ApiGatewayDiscoveryService(region);
        const apigatewayResources = await discovery.discover();
        return { ...results, apigateway: apigatewayResources };
      }
      case 's3': {
        const discovery = new S3DiscoveryService(region);
        const s3Resources = await discovery.discover();
        return { ...results, s3: s3Resources };
      }
      case 'sqs': {
        const discovery = new SqsDiscoveryService(region);
        const sqsResources = await discovery.discover();
        return { ...results, sqs: sqsResources };
      }
    }
  }

  getSupportedServices(): readonly AwsServiceType[] {
    return SUPPORTED_SERVICES;
  }

  private mergeResults(
    target: DiscoveredResources,
    source: DiscoveredResources
  ): void {
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

  private getServiceResourceCount(
    resources: DiscoveredResources,
    service: AwsServiceType
  ): number {
    switch (service) {
      case 'ec2':
        return resources.ec2.length;
      case 'rds':
        return resources.rds.length;
      case 'lambda':
        return resources.lambda.length;
      case 'ecs':
        return resources.ecs.length;
      case 'eks':
        return resources.eks.length;
      case 'elasticache':
        return resources.elasticache.length;
      case 'alb':
        return resources.alb.length;
      case 'nlb':
        return resources.nlb.length;
      case 'apigateway':
        return resources.apigateway.length;
      case 's3':
        return resources.s3.length;
      case 'sqs':
        return resources.sqs.length;
    }
  }
}

export function createAwsDiscoveryAdapter(): AwsDiscoveryPort {
  return new AwsDiscoveryAdapter();
}
