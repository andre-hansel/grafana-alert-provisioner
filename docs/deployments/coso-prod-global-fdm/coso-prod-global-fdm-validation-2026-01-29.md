# CloudWatch Validation Report
**Customer:** CoSo-prod-global-fdm
**Generated:** January 29, 2026 at 06:24 PM EST

## Summary
- Total Discovered: 70
- Included in Monitoring: 35
- Excluded from Monitoring: 35

## Exclusions

The following resources were excluded from monitoring. Each exclusion includes 
the verified reason from AWS and the rationale for the decision.

### No CloudWatch Activity

**Rationale:** These resources exist and are in a running/active state, but have not 
generated any CloudWatch metrics. This typically means:
- Resource was recently created (metrics appear within 5 minutes of activity)
- Resource has not received any traffic/invocations
- Resource is dormant/unused

**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers

**LAMBDA/US-EAST-1:**
- `global-fedramp-global-fedramp-oauth_response_dev`
- `global-fedramp-global-fedramp-internalEndpoints`
- `RealtimeVisibilityDiscoverRegions`
- `global-fedramp-global-fedramp-migrate_rollback`
- `zoom-webhook-relay-prod-f-DeploymentTestsOnEnd3698-ifzMfMsudChh`
- `global-fedramp-global-fedramp-authorize`
- `global-fedramp-global-fedramp-oauth_redirect`
- `global-fedramp-global-fedramp-public_asset`
- `global-fedramp-global-fedramp-api_long`
- `global-fedramp-global-fedramp-account_oauth_response_dev`
- `zoom-webhook-relay-prod-f-CustomVpcRestrictDefault-lAz7cwURX49X`
- `CrowdStrikeDSPMCreateEnvironmentLambda`
- `zoom-webhook-relay-prod-f-DeploymentTestsOnStart09-2UszeTPYMdnd`
- `zoom-webhook-relay-prod-f-LogRetentionaae0aa3c5b4d-UvRl6i0LHVSS`
- `global-fedramp-global-fedramp-account_oauth_response`
- `global-fedramp-global-fedramp-api_mso365_auth`
- `serverlessrepo-sumologic--SumoLogGroupExistingLamb-O8RvISrPSIGV`
- `zoom-webhook-relay-prod-f-ZoomWebhookRelayPodMigra-rVuAK3WAkRWF`
- `zoom-webhook-relay-prod-f-ZoomWebhookRelayRemoveSc-hStPk4o7ga8u`
- `global-fedramp-global-fedramp-migrate_latest`
- `global-fedramp-global-fedramp-api_mso365_my_organizations`
- `global-fedramp-global-fedramp-get_config`
- `global-fedramp-secret-rotation`
- `global-fedramp-global-fedramp-oauth_authorization_redirect`
- `cs-horizon-sensor-installation-orchestrator`
- `global-fedramp-global-fedramp-test`
- `global-fedramp-global-fedramp-join_meeting`
- `global-fedramp-global-fedramp-collab_oauth_response`

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

- `logs-class-technologies-global-fedramp-core` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-914798737783-us-east-2` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-914798737783-us-west-1` (S3, us-west-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-914798737783-us-west-2` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| No Activity | 31 | No traffic/invocations, no metrics yet |
| Unknown | 4 | Manual investigation required |
| **Total Excluded** | **35** | |
