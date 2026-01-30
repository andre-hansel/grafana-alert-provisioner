# CloudWatch Validation Report
**Customer:** CoSo
**Generated:** January 29, 2026 at 06:09 PM EST

## Summary
- Total Discovered: 627
- Included in Monitoring: 512
- Excluded from Monitoring: 115
- Warnings: 3

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

- `dev-alb` (ALB, us-east-1)
  - Healthy: 0, Unhealthy: 4
  - Unhealthy targets:
    - `i-0d7971220d0199c0c`: Target.ResponseCodeMismatch
    - `i-0711941d469202e6b`: Target.ResponseCodeMismatch
    - `i-086fce59a24c11eae`: Target.ResponseCodeMismatch
    - ... and 1 more
- `gml-alb` (ALB, us-east-1)
  - Healthy: 0, Unhealthy: 1
  - Unhealthy targets:
    - `i-006dfb44952da295b`: Target.FailedHealthChecks
- `lti-alb` (ALB, us-east-1)
  - Healthy: 0, Unhealthy: 1
  - Unhealthy targets:
    - `i-0de0fdadf19e616ae`: Target.ResponseCodeMismatch

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
| aws-cloud9-CaseyJones-IDEsofSummer-e7fc996d644846dabf3c832feb7e253f | EC2 | us-east-1 | stopped |
| aws-cloud9-SecureIDEThingy-e8acbeeaa4c2453b905b303e6c839a01 | EC2 | us-east-1 | stopped |
| Win10 | EC2 | us-east-1 | stopped |
| tutor-prod-bastion | EC2 | us-east-1 | stopped |
| cde-sso-service | ECS | us-east-1 | runningCount=0 |

**Decision:** EXCLUDED - alerts would show "No Data"

### Configuration Required

**Rationale:** These resources require explicit AWS configuration to emit CloudWatch metrics. 
Without the required configuration, no metrics are available for alerting.

#### EKS Container Insights Not Enabled

EKS clusters require the CloudWatch agent with Container Insights addon for metrics.

- `ncc-cas-na` (us-east-1)
- `app-platform-dev` (us-east-2)
- `app-platform-prod` (us-east-2)
- `app-platform-staging` (us-east-2)
- `app-platfrom-control-plane` (us-east-2)

**Decision:** EXCLUDED - no metrics available until configuration is enabled

### Load Balancers With No Targets

**Verified via:** ELBv2 DescribeTargetHealth API

**Rationale:** These load balancers have no targets registered. This typically indicates:
- Infrastructure reserved for future use
- Target group not yet attached to ASG/ECS service
- Deprecated infrastructure pending decommission

There is nothing to become unhealthy, so health-based alerts would be meaningless.

- `webrtc-commercial-ip-service` (ALB, us-east-1)
  - Target Groups: 1, Registered Targets: 0
- `k8s-ingressprod-4f435af540` (ALB, us-east-2)
  - Target Groups: 1, Registered Targets: 0
- `a16516c1475554bb38fe3d8f73bf02f1` (NLB, us-east-2)
  - Target Groups: 2, Registered Targets: 0

**Decision:** EXCLUDED - no targets to become unhealthy

### No CloudWatch Activity

**Rationale:** These resources exist and are in a running/active state, but have not 
generated any CloudWatch metrics. This typically means:
- Resource was recently created (metrics appear within 5 minutes of activity)
- Resource has not received any traffic/invocations
- Resource is dormant/unused

**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers

**LAMBDA/US-EAST-1:**
- `dominos-master-uat-api-authorizer-lambda`
- `dominos-master-dev-api-MobileVersions-create-lambda`
- `dominos-master-dev-api-MobileVersions-GetVersion-lambda`
- `dominos-master-prod-support-office-lambda`
- `dominos-master-prod-api-MobileVersions-update-lambda`
- `dominos-master-dev-teamslogin-lambda`
- `dominos-master-prod-api-MobileVersions-getall-lambda`
- `dominos-master-uat-api-MobileVersions-create-lambda`
- `dominos-master-prod-api-authorizer-lambda`
- `dominos-master-dev-api-MobileVersions-SetIgnoredVersion-lambda`
- `dominos-master-uat-api-MobileVersions-getall-lambda`
- `dominos-master-uat-api-MobileVersions-update-lambda`
- `dominos-master-dev-api-MobileVersions-delete-lambda`
- `dominos-master-uat-support-office-lambda`
- `dominos-master-uat-api-MobileVersions-SetIgnoredVersion-lambda`
- `dominos-master-uat-teamslogin-lambda`
- `dominos-master-uat-api-MobileVersions-GetVersion-lambda`
- `dominos-master-dev-api-authorizer-lambda`
- `dominos-master-dev-support-office-lambda`
- `dominos-master-uat-api-MobileVersions-get-lambda`
- `dominos-master-prod-api-MobileVersions-get-lambda`
- `dominos-master-dev-api-MobileVersions-get-lambda`
- `SecretsManagerActiveDirectoryRotationSingleUser`
- `dominos-master-dev-api-MobileVersions-update-lambda`
- `dominos-master-dev-api-MobileVersions-getall-lambda`
- `dominos-master-prod-api-MobileVersions-delete-lambda`
- `dominos-master-prod-api-MobileVersions-SetIgnoredVersion-lambda`
- `webrtc-commercial-ip-service-lambda`
- `dominos-master-uat-api-MobileVersions-delete-lambda`
- `dominos-master-prod-api-MobileVersions-create-lambda`

**LAMBDA/US-EAST-2:**
- `datadog-ec2-agent-installer-cleanup`

**LAMBDA/US-WEST-1:**
- `crowdstrike-hec-transform-us-west-1`

**LAMBDA/US-WEST-2:**
- `rogers-dev-users-notification-lambda`
- `datadog-ec2-agent-installer-cleanup`
- `rogers-prod-admins-notification-lambda`
- `rogers-uat-admins-notification-lambda`
- `rogers-prod-users-notification-lambda`
- `rogers-dev-processing-lambda`
- `crowdstrike-hec-transform-us-west-2`
- `rogers-uat-users-notification-lambda`
- `rogers-dev-admins-notification-lambda`
- `rogers-uat-processing-lambda`
- `rogers-prod-processing-lambda`

**APIGATEWAY/US-WEST-2:**
- `LambdaSimpleProxy`

**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic

### Unable to Determine Cause

**Rationale:** These resources do not have CloudWatch metrics, but the specific 
cause could not be verified from AWS APIs. Manual investigation may be required.

- `tutor-prod` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `tj2-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `pre-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `pto-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `cde-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `cso-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `tutor-uat` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `gem-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `gms-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `ct2-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `cit-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `email-proxy-prod` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `csd-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `tjx-sso` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `tutor-preprod` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `tutor-dev` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `rogers-dev` (ECS, us-west-2)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `rogers-uat` (ECS, us-west-2)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `rogers-prod` (ECS, us-west-2)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `ac-lti-prod-database-migration-backup` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `citi-uat-sp.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `citi-uat.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `coso-com-autosec-repo` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `coso-insights-cassandra-backups` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cosocloud-common-badges-us-east-2` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-us-east-1-s3-connector-dataretention-historicaldata-prod` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-us-east-1-s3.us-east-1.acaplepml` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-us-east-1-s3.us-east-1.acaptranscriberesponse` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-us-east-1-s3.us-east-1.certs` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-us-east-1-s3.us-east-1.contentcuration` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-us-east-1-s3.us-east-1.creds` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-us-east-1-s3.us-east-1.deploy` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cp-us-east-1-s3.us-east-1.leplogs` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-cloudtrail-728497176303-us-east-1` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `dominos-master-prod-media-assets` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `dominos-master-prod-support-office-origin` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `dominos-master-uat-media-assets` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `dominos-master-uat-support-office-origin` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `dominos-projects-logs` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `for-sftp-demo-integration` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `gm.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `gmservices.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `gmstage-sso.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `gmstage.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `i-car.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `i-carcqauth.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `i-carcqpub.connectsolutions.com` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `inventory-resource-datasync-wjc` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `tutor-preprod-media` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `webrtc-mycoso-cloud-recording` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-728497176303-us-east-2` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `mazdaai-dev-cdn-logs` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `mazdaai-dev-cdn-origin` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `nike-prod-media-assets` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `nike-staging-media-assets` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `webrtc-poc-recordings` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-728497176303-us-west-1` (S3, us-west-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-728497176303-us-west-2` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| Stopped Resources | 5 | Not running, no metrics emitted |
| Config Required | 5 | AWS configuration needed for metrics |
| No Targets | 3 | Load balancer has no registered targets |
| No Activity | 44 | No traffic/invocations, no metrics yet |
| Unknown | 58 | Manual investigation required |
| **Total Excluded** | **115** | |
