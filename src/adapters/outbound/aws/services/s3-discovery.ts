import {
  S3Client,
  ListBucketsCommand,
  GetBucketLocationCommand,
  GetBucketTaggingCommand,
  type Bucket,
  type Tag,
} from '@aws-sdk/client-s3';
import type { S3Resource, AwsResourceTag } from '../../../../domain/entities/aws-resource.js';

// Cache bucket locations globally to avoid repeated API calls across regions
const bucketLocationCache = new Map<string, string>();
let bucketListCache: Bucket[] | null = null;

export class S3DiscoveryService {
  private client: S3Client;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.client = new S3Client({ region });
  }

  async discover(): Promise<readonly S3Resource[]> {
    // ListBuckets is global - only fetch once and cache
    if (bucketListCache === null) {
      const command = new ListBucketsCommand({});
      const response = await this.client.send(command);
      bucketListCache = response.Buckets ?? [];
    }

    const buckets = bucketListCache;

    // First pass: get all bucket locations in parallel (if not cached)
    const bucketsToCheck = buckets.filter(b => b.Name && !bucketLocationCache.has(b.Name));

    if (bucketsToCheck.length > 0) {
      // Batch location lookups in parallel (limit concurrency to avoid throttling)
      const batchSize = 10;
      for (let i = 0; i < bucketsToCheck.length; i += batchSize) {
        const batch = bucketsToCheck.slice(i, i + batchSize);
        const locationPromises = batch.map(async bucket => {
          const location = await this.getBucketRegion(bucket.Name!);
          // null means us-east-1
          bucketLocationCache.set(bucket.Name!, location ?? 'us-east-1');
        });
        await Promise.all(locationPromises);
      }
    }

    // Filter buckets for this region
    const bucketsInRegion = buckets.filter(b => {
      if (!b.Name) return false;
      const bucketRegion = bucketLocationCache.get(b.Name);
      return bucketRegion === this.region;
    });

    // Get tags in parallel for buckets in this region
    const resources: S3Resource[] = await Promise.all(
      bucketsInRegion.map(async bucket => {
        const tags = await this.getBucketTags(bucket.Name!);
        return this.mapBucket(bucket, tags);
      })
    );

    return resources;
  }

  private async getBucketRegion(bucketName: string): Promise<string | null> {
    try {
      const command = new GetBucketLocationCommand({
        Bucket: bucketName,
      });
      const response = await this.client.send(command);
      // Empty LocationConstraint means us-east-1
      return response.LocationConstraint ?? null;
    } catch {
      return null;
    }
  }

  private async getBucketTags(bucketName: string): Promise<readonly AwsResourceTag[]> {
    try {
      const command = new GetBucketTaggingCommand({
        Bucket: bucketName,
      });
      const response = await this.client.send(command);
      return this.mapTags(response.TagSet);
    } catch {
      return [];
    }
  }

  private mapBucket(
    bucket: Bucket,
    tags: readonly AwsResourceTag[]
  ): S3Resource {
    const name = bucket.Name ?? 'unknown';
    return {
      id: name,
      arn: `arn:aws:s3:::${name}`,
      name,
      service: 's3',
      region: this.region,
      tags,
      creationDate: bucket.CreationDate?.toISOString() ?? new Date().toISOString(),
      hasRequestMetrics: true, // Assume true - CloudWatch will just return no data if not configured
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

// Clear cache between runs (useful for testing)
export function clearS3Cache(): void {
  bucketLocationCache.clear();
  bucketListCache = null;
}
