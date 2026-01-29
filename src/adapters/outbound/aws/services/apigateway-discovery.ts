import {
  APIGatewayClient,
  GetRestApisCommand,
  type RestApi,
} from '@aws-sdk/client-api-gateway';
import type { ApiGatewayResource, AwsResourceTag } from '../../../../domain/entities/aws-resource.js';

export class ApiGatewayDiscoveryService {
  private client: APIGatewayClient;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.client = new APIGatewayClient({ region });
  }

  async discover(): Promise<readonly ApiGatewayResource[]> {
    const resources: ApiGatewayResource[] = [];
    let position: string | undefined;

    do {
      const command = new GetRestApisCommand({
        position,
        limit: 500,
      });

      const response = await this.client.send(command);
      position = response.position;

      for (const api of response.items ?? []) {
        if (api.id && api.name) {
          resources.push(this.mapApi(api));
        }
      }
    } while (position);

    return resources;
  }

  private mapApi(api: RestApi): ApiGatewayResource {
    const name = api.name ?? 'unknown';
    const id = api.id ?? 'unknown';

    return {
      id,
      arn: `arn:aws:apigateway:${this.region}::/restapis/${id}`,
      name,
      service: 'apigateway',
      region: this.region,
      tags: this.mapTags(api.tags),
      description: api.description,
      createdDate: api.createdDate?.toISOString() ?? new Date().toISOString(),
      apiKeySource: api.apiKeySource,
      endpointConfiguration: api.endpointConfiguration?.types?.join(', '),
    };
  }

  private mapTags(tags: Record<string, string> | undefined): readonly AwsResourceTag[] {
    if (!tags) {
      return [];
    }
    return Object.entries(tags).map(([key, value]) => ({ key, value }));
  }
}
