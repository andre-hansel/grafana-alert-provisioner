import {
  SQSClient,
  ListQueuesCommand,
  GetQueueAttributesCommand,
  ListQueueTagsCommand,
  QueueAttributeName,
} from '@aws-sdk/client-sqs';
import type { SqsResource, AwsResourceTag } from '../../../../domain/entities/aws-resource.js';

export class SqsDiscoveryService {
  private client: SQSClient;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.client = new SQSClient({ region });
  }

  async discover(): Promise<readonly SqsResource[]> {
    const queueUrls: string[] = [];
    let nextToken: string | undefined;

    do {
      const command = new ListQueuesCommand({
        NextToken: nextToken,
      });

      const response = await this.client.send(command);
      nextToken = response.NextToken;

      if (response.QueueUrls) {
        queueUrls.push(...response.QueueUrls);
      }
    } while (nextToken);

    const resources: SqsResource[] = [];
    for (const queueUrl of queueUrls) {
      const resource = await this.describeQueue(queueUrl);
      if (resource) {
        resources.push(resource);
      }
    }

    return resources;
  }

  private async describeQueue(queueUrl: string): Promise<SqsResource | null> {
    try {
      const attributesCommand = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: [
          QueueAttributeName.QueueArn,
          QueueAttributeName.VisibilityTimeout,
          QueueAttributeName.MessageRetentionPeriod,
          QueueAttributeName.RedrivePolicy,
        ],
      });

      const attributesResponse = await this.client.send(attributesCommand);
      const attributes = attributesResponse.Attributes ?? {};

      const tags = await this.getQueueTags(queueUrl);
      const name = this.extractQueueName(queueUrl);
      const arn = attributes[QueueAttributeName.QueueArn] ?? `arn:aws:sqs:${this.region}:unknown:${name}`;

      // Detect DLQ - RedrivePolicy contains deadLetterTargetArn if configured
      const hasDlq = !!attributes[QueueAttributeName.RedrivePolicy];

      return {
        id: name,
        arn,
        name,
        service: 'sqs',
        region: this.region,
        tags,
        queueUrl,
        isFifo: name.endsWith('.fifo'),
        visibilityTimeout: this.parseIntOrUndefined(attributes[QueueAttributeName.VisibilityTimeout]),
        messageRetentionPeriod: this.parseIntOrUndefined(attributes[QueueAttributeName.MessageRetentionPeriod]),
        hasDlq,
      };
    } catch {
      return null;
    }
  }

  private async getQueueTags(queueUrl: string): Promise<readonly AwsResourceTag[]> {
    try {
      const command = new ListQueueTagsCommand({
        QueueUrl: queueUrl,
      });
      const response = await this.client.send(command);

      if (!response.Tags) {
        return [];
      }

      return Object.entries(response.Tags).map(([key, value]) => ({ key, value }));
    } catch {
      return [];
    }
  }

  private extractQueueName(queueUrl: string): string {
    const parts = queueUrl.split('/');
    return parts[parts.length - 1] ?? 'unknown';
  }

  private parseIntOrUndefined(value: string | undefined): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  }
}
