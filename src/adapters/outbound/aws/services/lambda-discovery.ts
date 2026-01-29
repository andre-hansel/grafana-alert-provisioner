import {
  LambdaClient,
  ListFunctionsCommand,
  ListTagsCommand,
  GetPolicyCommand,
  type FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import type { LambdaResource, AwsResourceTag } from '../../../../domain/entities/aws-resource.js';

export class LambdaDiscoveryService {
  private client: LambdaClient;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.client = new LambdaClient({ region });
  }

  async discover(): Promise<readonly LambdaResource[]> {
    const resources: LambdaResource[] = [];
    let marker: string | undefined;

    do {
      const command = new ListFunctionsCommand({
        Marker: marker,
      });

      const response = await this.client.send(command);
      marker = response.NextMarker;

      for (const func of response.Functions ?? []) {
        if (func.FunctionName && func.FunctionArn) {
          const [tags, isEdgeFunction] = await Promise.all([
            this.getTags(func.FunctionArn),
            this.checkIfEdgeFunction(func.FunctionName),
          ]);
          resources.push(this.mapFunction(func, tags, isEdgeFunction));
        }
      }
    } while (marker);

    return resources;
  }

  private async getTags(functionArn: string): Promise<readonly AwsResourceTag[]> {
    try {
      const command = new ListTagsCommand({
        Resource: functionArn,
      });
      const response = await this.client.send(command);
      return Object.entries(response.Tags ?? {}).map(([key, value]) => ({
        key,
        value,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Check if a function is Lambda@Edge by examining its resource-based policy.
   * Lambda@Edge functions have a policy allowing cloudfront.amazonaws.com to invoke them.
   */
  private async checkIfEdgeFunction(functionName: string): Promise<boolean> {
    // Lambda@Edge functions can only be created in us-east-1
    if (this.region !== 'us-east-1') {
      return false;
    }

    try {
      const command = new GetPolicyCommand({
        FunctionName: functionName,
      });
      const response = await this.client.send(command);

      if (response.Policy) {
        const policy = JSON.parse(response.Policy);
        // Check if any statement allows CloudFront to invoke this function
        for (const statement of policy.Statement ?? []) {
          const principal = statement.Principal;
          if (
            principal === 'edgelambda.amazonaws.com' ||
            principal?.Service === 'edgelambda.amazonaws.com' ||
            principal === 'cloudfront.amazonaws.com' ||
            principal?.Service === 'cloudfront.amazonaws.com'
          ) {
            return true;
          }
        }
      }
      return false;
    } catch {
      // No policy or access denied - not an edge function (or we can't tell)
      return false;
    }
  }

  private mapFunction(
    func: FunctionConfiguration,
    tags: readonly AwsResourceTag[],
    isEdgeFunction: boolean
  ): LambdaResource {
    // Detect DLQ configuration
    const hasDlqConfigured = !!func.DeadLetterConfig?.TargetArn;

    return {
      id: func.FunctionName ?? 'unknown',
      arn: func.FunctionArn ?? `arn:aws:lambda:${this.region}:unknown:function:${func.FunctionName}`,
      name: func.FunctionName ?? 'unknown',
      service: 'lambda',
      region: this.region,
      tags,
      runtime: func.Runtime ?? 'unknown',
      memorySize: func.MemorySize ?? 128,
      timeout: func.Timeout ?? 3,
      handler: func.Handler ?? 'unknown',
      lastModified: func.LastModified ?? new Date().toISOString(),
      hasDlqConfigured,
      isEdgeFunction,
    };
  }
}
