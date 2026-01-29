import type { AwsDiscoveryPort, DiscoveryProgress } from '../ports/outbound/aws-discovery-port.js';
import type { DiscoveredResources } from '../domain/entities/aws-resource.js';
import { getTotalResourceCount } from '../domain/entities/aws-resource.js';

export interface DiscoverInfrastructureInput {
  region: string;
  onProgress?: (progress: DiscoveryProgress) => void;
}

export interface DiscoverInfrastructureOutput {
  resources: DiscoveredResources;
  totalCount: number;
  region: string;
}

export class DiscoverInfrastructureUseCase {
  constructor(private awsDiscovery: AwsDiscoveryPort) {}

  async execute(input: DiscoverInfrastructureInput): Promise<DiscoverInfrastructureOutput> {
    const { region, onProgress } = input;

    // Validate credentials first
    const credentialsStatus = await this.awsDiscovery.validateCredentials();
    if (!credentialsStatus.valid) {
      throw new Error(credentialsStatus.error ?? 'Invalid AWS credentials');
    }

    // Run discovery
    const resources = await this.awsDiscovery.discoverResources({
      region,
      onProgress,
    });

    return {
      resources,
      totalCount: getTotalResourceCount(resources),
      region,
    };
  }
}

export function createDiscoverInfrastructureUseCase(
  awsDiscovery: AwsDiscoveryPort
): DiscoverInfrastructureUseCase {
  return new DiscoverInfrastructureUseCase(awsDiscovery);
}
