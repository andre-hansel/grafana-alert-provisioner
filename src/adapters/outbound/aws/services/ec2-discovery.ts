import {
  EC2Client,
  DescribeInstancesCommand,
  type Instance,
  type Tag,
} from '@aws-sdk/client-ec2';
import type { Ec2Resource, AwsResourceTag } from '../../../../domain/entities/aws-resource.js';

export class Ec2DiscoveryService {
  private client: EC2Client;

  constructor(region: string) {
    this.client = new EC2Client({ region });
  }

  async discover(): Promise<readonly Ec2Resource[]> {
    const resources: Ec2Resource[] = [];
    let nextToken: string | undefined;

    do {
      const command = new DescribeInstancesCommand({
        NextToken: nextToken,
        Filters: [
          {
            Name: 'instance-state-name',
            Values: ['running', 'stopped'],
          },
        ],
      });

      const response = await this.client.send(command);
      nextToken = response.NextToken;

      for (const reservation of response.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          if (instance.InstanceId) {
            resources.push(this.mapInstance(instance));
          }
        }
      }
    } while (nextToken);

    return resources;
  }

  private mapInstance(instance: Instance): Ec2Resource {
    const name = this.getInstanceName(instance.Tags) ?? instance.InstanceId ?? 'unknown';
    const region = instance.Placement?.AvailabilityZone?.slice(0, -1) ?? 'unknown';

    return {
      id: instance.InstanceId ?? 'unknown',
      arn: `arn:aws:ec2:${region}:${this.extractAccountId(instance)}:instance/${instance.InstanceId}`,
      name,
      service: 'ec2',
      region,
      tags: this.mapTags(instance.Tags),
      instanceType: instance.InstanceType ?? 'unknown',
      state: instance.State?.Name ?? 'unknown',
      vpcId: instance.VpcId,
      subnetId: instance.SubnetId,
      privateIpAddress: instance.PrivateIpAddress,
      publicIpAddress: instance.PublicIpAddress,
    };
  }

  private getInstanceName(tags: Tag[] | undefined): string | undefined {
    return tags?.find(t => t.Key === 'Name')?.Value;
  }

  private extractAccountId(instance: Instance): string {
    // Extract from IAM instance profile ARN if available
    const profileArn = instance.IamInstanceProfile?.Arn;
    if (profileArn) {
      const match = profileArn.match(/arn:aws:iam::(\d+):/);
      if (match?.[1]) {
        return match[1];
      }
    }
    return 'unknown';
  }

  private mapTags(tags: Tag[] | undefined): readonly AwsResourceTag[] {
    return (tags ?? [])
      .filter((t): t is Tag & { Key: string; Value: string } =>
        t.Key !== undefined && t.Value !== undefined
      )
      .map(t => ({ key: t.Key, value: t.Value }));
  }
}
