import type { DiscoveredResources, AwsServiceType } from '../../domain/entities/aws-resource.js';

export interface AwsCredentialsStatus {
  readonly valid: boolean;
  readonly accountId?: string;
  readonly userId?: string;
  readonly arn?: string;
  readonly error?: string;
}

export interface DiscoveryProgress {
  readonly service: AwsServiceType;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'error';
  readonly resourceCount?: number;
  readonly error?: string;
}

export interface DiscoveryOptions {
  readonly region: string;
  readonly services?: readonly AwsServiceType[];
  readonly onProgress?: (progress: DiscoveryProgress) => void;
}

export interface AwsDiscoveryPort {
  validateCredentials(): Promise<AwsCredentialsStatus>;

  discoverResources(options: DiscoveryOptions): Promise<DiscoveredResources>;

  discoverService(
    service: AwsServiceType,
    region: string
  ): Promise<DiscoveredResources>;

  getSupportedServices(): readonly AwsServiceType[];
}
