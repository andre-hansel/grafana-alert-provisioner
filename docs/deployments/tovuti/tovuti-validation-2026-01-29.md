# CloudWatch Validation Report
**Customer:** Tovuti
**Generated:** January 29, 2026 at 05:55 PM EST

## Summary
- Total Discovered: 52
- Included in Monitoring: 37
- Excluded from Monitoring: 15
- Warnings: 1

## Warnings

The following resources are **included in monitoring** but have conditions that may 
cause alerts to fire immediately after deployment.

### Load Balancers With All Targets Unhealthy

**Verified via:** ELBv2 DescribeTargetHealth API

**Rationale:** These load balancers have registered targets but all are currently unhealthy. 
Alerts for these resources **will fire immediately** after deployment. This is intentional - 
if there is a real problem, you want to know about it.

Possible causes:
- Active outage that should be investigated
- Service intentionally scaled to zero
- Health check misconfiguration

- `k8s-lms-oauthred-351f633a6d` (ALB, us-west-2)
  - Healthy: 0, Unhealthy: 6
  - Unhealthy targets:
    - `i-0a7140726e39f24a9`: Target.FailedHealthChecks
    - `i-06f158600a825bc31`: Target.FailedHealthChecks
    - `i-0e48aa556084cac6f`: Target.FailedHealthChecks
    - ... and 3 more

**Decision:** INCLUDED - real problems should trigger alerts, even immediately after deployment

## Exclusions

The following resources were excluded from monitoring. Each exclusion includes 
the verified reason from AWS and the rationale for the decision.

### Configuration Required

**Rationale:** These resources require explicit AWS configuration to emit CloudWatch metrics. 
Without the required configuration, no metrics are available for alerting.

#### EKS Container Insights Not Enabled

EKS clusters require the CloudWatch agent with Container Insights addon for metrics.

- `lms-prod-knox-fr-us-primary` (us-west-2)

**Decision:** EXCLUDED - no metrics available until configuration is enabled

### Load Balancers With No Targets

**Verified via:** ELBv2 DescribeTargetHealth API

**Rationale:** These load balancers have no targets registered. This typically indicates:
- Infrastructure reserved for future use
- Target group not yet attached to ASG/ECS service
- Deprecated infrastructure pending decommission

There is nothing to become unhealthy, so health-based alerts would be meaningless.

- `k8s-lms-intingre-2f94f86ee6` (ALB, us-west-2)
  - Target Groups: 0, Registered Targets: 0
- `k8s-lms-lmsphpfp-14f0cedbf0` (ALB, us-west-2)
  - Target Groups: 0, Registered Targets: 0

**Decision:** EXCLUDED - no targets to become unhealthy

### No CloudWatch Activity

**Rationale:** These resources exist and are in a running/active state, but have not 
generated any CloudWatch metrics. This typically means:
- Resource was recently created (metrics appear within 5 minutes of activity)
- Resource has not received any traffic/invocations
- Resource is dormant/unused

**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers

**LAMBDA/US-EAST-1:**
- `RealtimeVisibilityDiscoverRegions`
- `cs-horizon-sensor-installation-orchestrator`
- `CrowdStrikeDSPMCreateEnvironmentLambda`

**LAMBDA/US-EAST-2:**
- `crowdstrike-hec-transform-us-east-2`

**LAMBDA/US-WEST-2:**
- `delete-name-tags-us-west-2-aea5-6dtjj`
- `production-terminate-instances`

**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic

### Unable to Determine Cause

**Rationale:** These resources do not have CloudWatch metrics, but the specific 
cause could not be verified from AWS APIs. Manual investigation may be required.

- `aws-ssm-08593b0bca612815` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `tovuti-ssm-session-logs-845989088642` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-845989088642-us-east-2` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `aws-waf-logs-knox-datadog-failed-logs-delivery.lms.prod.tovuti` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `production-845989088642-gitlab-runner-cache` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `us-west-2-knox-fr-datadog-failed-logs-delivery.lms.prod.tovuti` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| Config Required | 1 | AWS configuration needed for metrics |
| No Targets | 2 | Load balancer has no registered targets |
| No Activity | 6 | No traffic/invocations, no metrics yet |
| Unknown | 6 | Manual investigation required |
| **Total Excluded** | **15** | |
