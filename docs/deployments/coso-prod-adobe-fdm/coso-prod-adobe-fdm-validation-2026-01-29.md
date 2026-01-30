# CloudWatch Validation Report
**Customer:** CoSo-prod-adobe-fdm
**Generated:** January 29, 2026 at 06:18 PM EST

## Summary
- Total Discovered: 433
- Included in Monitoring: 372
- Excluded from Monitoring: 61
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

- `websocket-cdet-external` (ALB, us-east-1)
  - Healthy: 0, Unhealthy: 1
  - Unhealthy targets:
    - `i-033c5d3f58b60d735`: Target.Timeout

**Decision:** INCLUDED - real problems should trigger alerts, even immediately after deployment

## Exclusions

The following resources were excluded from monitoring. Each exclusion includes 
the verified reason from AWS and the rationale for the decision.

### Stopped/Inactive Resources

**Rationale:** These resources exist in AWS but are not currently running. 
Stopped resources do not emit CloudWatch metrics. Creating alerts for them would 
result in "No Data" states, which can be confusing and mask real issues.

**Verified via:** EC2 DescribeInstances (state), RDS DescribeDBInstances (status), ECS DescribeServices (runningCount)

| Resource | Service | Region | State |
|---|---|---|---|
| fed-sso-service | ECS | us-east-1 | runningCount=0 |
| pto-sso-service | ECS | us-east-1 | runningCount=0 |

**Decision:** EXCLUDED - alerts would show "No Data"

### Configuration Required

**Rationale:** These resources require explicit AWS configuration to emit CloudWatch metrics. 
Without the required configuration, no metrics are available for alerting.

#### ECS Container Insights Not Enabled

**Verified via:** ECS DescribeClusters API (settings.containerInsights)

ECS clusters require Container Insights to emit CPU/Memory metrics. Enable via:
`aws ecs update-cluster-settings --cluster <name> --settings name=containerInsights,value=enabled`

- `cp-apacprod-ecscluster1-cprimeuppprovisionerEcsSvc-FKqTMSVIYEpy` on cluster `ALM-ECS-2` (us-east-1)
- `dbmigration` on cluster `ALM-ECS-3` (us-east-1)

#### EKS Container Insights Not Enabled

EKS clusters require the CloudWatch agent with Container Insights addon for metrics.

- `ncc-cas-na` (us-east-1)

**Decision:** EXCLUDED - no metrics available until configuration is enabled

### Load Balancers With No Targets

**Verified via:** ELBv2 DescribeTargetHealth API

**Rationale:** These load balancers have no targets registered. This typically indicates:
- Infrastructure reserved for future use
- Target group not yet attached to ASG/ECS service
- Deprecated infrastructure pending decommission

There is nothing to become unhealthy, so health-based alerts would be meaningless.

- `insights-pub-alb` (ALB, us-east-1)
  - Target Groups: 3, Registered Targets: 0
- `webrtc-fed-ip-service` (ALB, us-east-1)
  - Target Groups: 1, Registered Targets: 0
- `cp-ap-elbcp-1HSTH7D62GYN6` (ALB, us-east-1)
  - Target Groups: 1, Registered Targets: 0
- `cp-ap-elbEl-2Y2OYULP1EIK` (ALB, us-east-1)
  - Target Groups: 1, Registered Targets: 0
- `public-api-nh-alb` (ALB, us-east-1)
  - Target Groups: 1, Registered Targets: 0
- `dbmigration-alb` (ALB, us-east-1)
  - Target Groups: 1, Registered Targets: 0
- `cp-ap-elbAc-SJCPSVMSZW0M` (NLB, us-east-1)
  - Target Groups: 1, Registered Targets: 0

**Decision:** EXCLUDED - no targets to become unhealthy

### No CloudWatch Activity

**Rationale:** These resources exist and are in a running/active state, but have not 
generated any CloudWatch metrics. This typically means:
- Resource was recently created (metrics appear within 5 minutes of activity)
- Resource has not received any traffic/invocations
- Resource is dormant/unused

**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers

**LAMBDA/US-EAST-1:**
- `cs-horizon-sensor-installation-orchestrator`
- `delete-name-tags-us-east-1-cwhti`
- `ALM_Migration_Unlock`
- `webrtc-fed-ip-service-lambda`
- `RealtimeVisibilityDiscoverRegions`
- `CrowdStrikeDSPMCreateEnvironmentLambda`

**LAMBDA/US-EAST-2:**
- `crowdstrike-hec-transform-us-east-2`

**LAMBDA/US-WEST-1:**
- `crowdstrike-hec-transform-us-west-1`

**LAMBDA/US-WEST-2:**
- `crowdstrike-hec-transform-us-west-2`

**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic

### Unable to Determine Cause

**Rationale:** These resources do not have CloudWatch metrics, but the specific 
cause could not be verified from AWS APIs. Manual investigation may be required.

- `ALM-ECS-2` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `fed-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `fd2-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `alm-email-alm` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `alm-snaplogic-alm` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `default` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `insights-prod` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `ALM-ECS-1` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `ALM-ECS-4` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `ALM-ECS-3` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `pto-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `captivate-apacprod-app-coso` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `connectdot.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `connectdotcqauth1.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `connectdotcqpub1.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod-datamigrator-coso` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod-us-east-1-connector-store` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod-us-east-1-coso-jobs` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod-us-east-1-primebi-data` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod.us-east-1.coso.acaptranscriberesponse` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod.us-east-1.coso.certs` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod.us-east-1.coso.contentcuration` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod.us-east-1.coso.creds` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod.us-east-1.coso.deploy` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod.us-east-1.coso.dynamodb-backup` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-apacprod.us-east-1.coso.wp-backup` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-connector-dataretention-historicaldata-apacprod-coso` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-coso-us-east-1-airflow` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-coso-us-east-1-deltalake-spark` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-coso-us-east-1-emr-studio` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-coso-us-east-1-msk-customized-plugins` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-s3-us-east-1-leplogs-coso` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `dynamo-db-backup.captivateprime.apacprod-coso` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `dynamo-db-backup.captivateprime.apacprod-logs-coso` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `insights-prod-badges` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `webrtc-fed-artifacts` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `webrtc-fed-bucket-access-logs` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-927356132144-us-east-2` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-927356132144-us-west-1` (S3, us-west-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-927356132144-us-west-2` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| Stopped Resources | 2 | Not running, no metrics emitted |
| Config Required | 3 | AWS configuration needed for metrics |
| No Targets | 7 | Load balancer has no registered targets |
| No Activity | 9 | No traffic/invocations, no metrics yet |
| Unknown | 40 | Manual investigation required |
| **Total Excluded** | **61** | |
