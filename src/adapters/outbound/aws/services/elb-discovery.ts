import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeTagsCommand,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  type LoadBalancer,
  type Tag,
  type TargetGroup,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import type {
  AlbResource,
  NlbResource,
  AwsResourceTag,
  LoadBalancerTargetHealth,
  TargetHealthDetail,
} from '../../../../domain/entities/aws-resource.js';

export class ElbDiscoveryService {
  private client: ElasticLoadBalancingV2Client;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.client = new ElasticLoadBalancingV2Client({ region });
  }

  async discoverAlbs(): Promise<readonly AlbResource[]> {
    const loadBalancers = await this.discoverLoadBalancers('application');
    const results: AlbResource[] = [];

    for (const lb of loadBalancers) {
      const targetHealth = await this.getLoadBalancerTargetHealth(lb.loadBalancer.LoadBalancerArn);
      results.push(this.mapToAlb(lb.loadBalancer, lb.tags, targetHealth));
    }

    return results;
  }

  async discoverNlbs(): Promise<readonly NlbResource[]> {
    const loadBalancers = await this.discoverLoadBalancers('network');
    const results: NlbResource[] = [];

    for (const lb of loadBalancers) {
      const targetHealth = await this.getLoadBalancerTargetHealth(lb.loadBalancer.LoadBalancerArn);
      results.push(this.mapToNlb(lb.loadBalancer, lb.tags, targetHealth));
    }

    return results;
  }

  private async getLoadBalancerTargetHealth(loadBalancerArn: string | undefined): Promise<LoadBalancerTargetHealth | undefined> {
    if (!loadBalancerArn) return undefined;

    try {
      // Get all target groups for this load balancer
      const targetGroups = await this.getTargetGroupsForLoadBalancer(loadBalancerArn);

      if (targetGroups.length === 0) {
        return {
          registeredTargetCount: 0,
          healthyTargetCount: 0,
          unhealthyTargetCount: 0,
          targetGroupCount: 0,
          details: [],
        };
      }

      const allDetails: TargetHealthDetail[] = [];
      let totalHealthy = 0;
      let totalUnhealthy = 0;
      let totalRegistered = 0;

      for (const tg of targetGroups) {
        if (!tg.TargetGroupArn) continue;

        const healthCommand = new DescribeTargetHealthCommand({
          TargetGroupArn: tg.TargetGroupArn,
        });

        const healthResponse = await this.client.send(healthCommand);
        const targets = healthResponse.TargetHealthDescriptions ?? [];

        totalRegistered += targets.length;

        for (const target of targets) {
          const state = this.mapTargetHealthState(target.TargetHealth?.State);

          if (state === 'healthy') {
            totalHealthy++;
          } else if (state === 'unhealthy') {
            totalUnhealthy++;
          }

          allDetails.push({
            targetId: target.Target?.Id ?? 'unknown',
            targetGroupArn: tg.TargetGroupArn,
            state,
            reason: target.TargetHealth?.Reason,
          });
        }
      }

      return {
        registeredTargetCount: totalRegistered,
        healthyTargetCount: totalHealthy,
        unhealthyTargetCount: totalUnhealthy,
        targetGroupCount: targetGroups.length,
        details: allDetails,
      };
    } catch {
      // If we can't get target health, return undefined (don't fail discovery)
      return undefined;
    }
  }

  private async getTargetGroupsForLoadBalancer(loadBalancerArn: string): Promise<TargetGroup[]> {
    const targetGroups: TargetGroup[] = [];
    let marker: string | undefined;

    do {
      const command = new DescribeTargetGroupsCommand({
        LoadBalancerArn: loadBalancerArn,
        Marker: marker,
      });

      const response = await this.client.send(command);
      marker = response.NextMarker;

      for (const tg of response.TargetGroups ?? []) {
        targetGroups.push(tg);
      }
    } while (marker);

    return targetGroups;
  }

  private mapTargetHealthState(
    state: string | undefined
  ): TargetHealthDetail['state'] {
    switch (state) {
      case 'healthy':
        return 'healthy';
      case 'unhealthy':
        return 'unhealthy';
      case 'draining':
        return 'draining';
      case 'unavailable':
        return 'unavailable';
      case 'unused':
        return 'unused';
      case 'initial':
        return 'initial';
      default:
        return 'unavailable';
    }
  }

  private async discoverLoadBalancers(
    type: 'application' | 'network'
  ): Promise<{ loadBalancer: LoadBalancer; tags: readonly AwsResourceTag[] }[]> {
    const loadBalancers: LoadBalancer[] = [];
    let marker: string | undefined;

    do {
      const command = new DescribeLoadBalancersCommand({
        Marker: marker,
      });

      const response = await this.client.send(command);
      marker = response.NextMarker;

      for (const lb of response.LoadBalancers ?? []) {
        if (lb.Type === type && lb.LoadBalancerArn) {
          loadBalancers.push(lb);
        }
      }
    } while (marker);

    // Get tags for all load balancers
    const result: { loadBalancer: LoadBalancer; tags: readonly AwsResourceTag[] }[] = [];

    // Describe tags in batches of 20
    for (let i = 0; i < loadBalancers.length; i += 20) {
      const batch = loadBalancers.slice(i, i + 20);
      const arns = batch.map(lb => lb.LoadBalancerArn).filter((arn): arn is string => arn !== undefined);

      if (arns.length > 0) {
        const tagsCommand = new DescribeTagsCommand({
          ResourceArns: arns,
        });

        const tagsResponse = await this.client.send(tagsCommand);
        const tagMap = new Map<string, readonly AwsResourceTag[]>();

        for (const tagDesc of tagsResponse.TagDescriptions ?? []) {
          if (tagDesc.ResourceArn) {
            tagMap.set(tagDesc.ResourceArn, this.mapTags(tagDesc.Tags));
          }
        }

        for (const lb of batch) {
          result.push({
            loadBalancer: lb,
            tags: tagMap.get(lb.LoadBalancerArn ?? '') ?? [],
          });
        }
      }
    }

    return result;
  }

  private mapToAlb(
    lb: LoadBalancer,
    tags: readonly AwsResourceTag[],
    targetHealth?: LoadBalancerTargetHealth
  ): AlbResource {
    const name = lb.LoadBalancerName ?? 'unknown';
    return {
      id: name,
      arn: lb.LoadBalancerArn ?? `arn:aws:elasticloadbalancing:${this.region}:unknown:loadbalancer/app/${name}`,
      name,
      service: 'alb',
      region: this.region,
      tags,
      dnsName: lb.DNSName ?? 'unknown',
      scheme: lb.Scheme ?? 'internet-facing',
      vpcId: lb.VpcId ?? 'unknown',
      state: lb.State?.Code ?? 'unknown',
      targetHealth,
    };
  }

  private mapToNlb(
    lb: LoadBalancer,
    tags: readonly AwsResourceTag[],
    targetHealth?: LoadBalancerTargetHealth
  ): NlbResource {
    const name = lb.LoadBalancerName ?? 'unknown';
    return {
      id: name,
      arn: lb.LoadBalancerArn ?? `arn:aws:elasticloadbalancing:${this.region}:unknown:loadbalancer/net/${name}`,
      name,
      service: 'nlb',
      region: this.region,
      tags,
      dnsName: lb.DNSName ?? 'unknown',
      scheme: lb.Scheme ?? 'internet-facing',
      vpcId: lb.VpcId ?? 'unknown',
      state: lb.State?.Code ?? 'unknown',
      targetHealth,
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
