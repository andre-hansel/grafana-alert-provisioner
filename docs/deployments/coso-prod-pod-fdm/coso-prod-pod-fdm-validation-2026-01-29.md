# CloudWatch Validation Report
**Customer:** CoSo-prod-pod-fdm
**Generated:** January 29, 2026 at 06:27 PM EST

## Summary
- Total Discovered: 187
- Included in Monitoring: 115
- Excluded from Monitoring: 72

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
- `pod-pod-1-us-east-1-fedramp-canEmbed`
- `recording-mgmt-svc-prod-fe-RmsDynamoStreamEAB13572-CIHX9JxFbfCx`
- `cs-horizon-sensor-installation-orchestrator`
- `pod-pod-1-us-east-1-fedramp-custom-resource-apigw-cw-role`
- `doc-conversion-svc-prod-f-SvcConvertLambdaF1FA374A-NwkhLKjbzwOd`
- `moodle-db-factory`
- `doc-conversion-svc-prod-f-CustomS3AutoDeleteObject-HOP3LjtIBCG6`
- `doc-conversion-svc-prod-f-DeploymentTestsOnEnd3698-L38qdbhlCblv`
- `pod-secret-rotation`
- `pod-pod-1-us-east-1-fedramp-problemReportUploadUrl`
- `pod-pod-1-us-east-1-fedramp-tokenAuthorizer`
- `pod-pod-1-us-east-1-fedramp-problemReportEvent`
- `recording-mgmt-svc-prod-f-RmsKeyGroupProviderHandl-vF1a4EkjjoHo`
- `pod-pod-1-us-east-1-fedramp-dialInCallback`
- `pod-pod-1-us-east-1-fedramp-oauth`
- `pod-pod-1-us-east-1-fedramp-migrate_rollback`
- `serverlessrepo-sumologic--SumoLogGroupExistingLamb-xAeyveuLaDBM`
- `recording-mgmt-svc-prod-f-RmsRemoveRecordingD89EFB-S106pwzZP7x9`
- `recording-mgmt-svc-prod-f-LogRetentionaae0aa3c5b4d-nA1s7zJoDYhh`
- `pod-pod-1-us-east-1-fedramp-zoomTokens`
- `doc-conversion-svc-prod-f-SvcFailureLambda88C50933-3REyAbujtP7Y`
- `pod-pod-1-us-east-1-fedramp-publicEndpoints`
- `recording-mgmt-svc-prod-fed-RmsZoomWebhook205E89F6-PNvwAlEmKm82`
- `pod-pod-1-us-east-1-fedramp-internalEndpoints`
- `doc-conversion-svc-prod-f-LogRetentionaae0aa3c5b4d-A8pj32O9DPsi`
- `pod-pod-1-us-east-1-fedramp-breakoutImagesGet`
- `doc-conversion-svc-prod-f-DeploymentTestsOnStart09-5A59Y6FkZEEf`
- `doc-conversion-svc-prod-fed-SvcStartLambdaF67E3EE9-ggb4Fp4ONCXM`
- `CrowdStrikeDSPMCreateEnvironmentLambda`
- `pod-pod-1-us-east-1-fedramp-legacyPublicAttendanceGet`
- `recording-mgmt-svc-prod-fed-RmsAzureEvents2DDC2136-TlzhEasrmZ2O`
- `recording-mgmt-svc-prod-fedramp-RmsConcatA6795DFD-PaZnrwox05bQ`
- `recording-mgmt-svc-prod-f-CustomS3AutoDeleteObject-4npQsW1KEbPZ`
- `pod-pod-1-us-east-1-fedramp-legacyPublicClassCreate`
- `RealtimeVisibilityDiscoverRegions`
- `recording-mgmt-svc-prod-f-RmsKeyGroupProviderframe-wWlDsXcZTe4B`
- `pod-pod-1-us-east-1-fedramp-migrate_latest`
- `recording-mgmt-svc-prod-f-RmsExportRecordings7AC2D-C8bOSMAMTOtO`
- `pod-pod-1-us-east-1-fedramp-custom-resource-existing-s3`
- `pod-pod-1-us-east-1-fedramp-s3AssetGet`
- `pod-pod-1-us-east-1-fedramp-whiteboardImageReport`
- `pod-pod-1-us-east-1-fedramp-assetConversionEvent`
- `ds-py-pod-1-us-east-1-fedramp-runTest`
- `recording-mgmt-svc-prod-f-RmsKeyGroupRotationLambd-N4NG6cTzcqE5`
- `pod-pod-1-us-east-1-fedramp-imageResizer`
- `pod-pod-1-us-east-1-fedramp-run_routines`
- `pod-pod-1-us-east-1-fedramp-admin_api`
- `pod-pod-1-us-east-1-fedramp-assetUploadEvent`
- `pod-pod-1-us-east-1-fedramp-microsoftGraph`
- `recording-mgmt-svc-prod-f-DeploymentTestsOnEnd3698-XvL2obI4n3N4`
- `pod-pod-1-us-east-1-fedramp-syllabus`
- `pod-pod-1-us-east-1-fedramp-importRecordings`
- `recording-mgmt-svc-prod-fe-RmsGetArtifacts31BCC526-zbNK8uRm4fbB`
- `pod-pod-1-us-east-1-fedramp-userUuidVerificationCode`
- `recording-mgmt-svc-prod-f-DeploymentTestsOnStart09-XW4kVgvma0WH`
- `pod-pod-1-us-east-1-fedramp-viltConnector`
- `pod-pod-1-us-east-1-fedramp-async_api`
- `recording-mgmt-svc-prod-f-RmsRemoveRecordings9A7DA-asWJdy7g8NUc`
- `recording-mgmt-svc-prod-f-CustomCDKBucketDeploymen-eh76Qqbt8dDQ`
- `pod-pod-1-us-east-1-fedramp-versions`
- `pod-pod-1-us-east-1-fedramp-legacyPublicEnrollment`
- `notify-slack-moodle`

**LAMBDA/US-EAST-2:**
- `serverlessrepo-sumologic--SumoLogGroupExistingLamb-HsJTMhr7UBAw`

**LAMBDA/US-WEST-1:**
- `crowdstrike-hec-transform-us-west-1`

**LAMBDA/US-WEST-2:**
- `crowdstrike-hec-transform-us-west-2`

**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic

### Unable to Determine Cause

**Rationale:** These resources do not have CloudWatch metrics, but the specific 
cause could not be verified from AWS APIs. Manual investigation may be required.

- `moodle` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `doc-conversion-svc-prod-fedr-svctestbucket3efdbdb6-al32c8hcg22c` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `pod-1-us-east-1-fedramp-data-science-bucket` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `recording-mgmt-svc-pod-1-us-east-1-fedramp-fedramp-exports` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-174339124211-us-east-2` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-174339124211-us-west-1` (S3, us-west-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-174339124211-us-west-2` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| No Activity | 65 | No traffic/invocations, no metrics yet |
| Unknown | 7 | Manual investigation required |
| **Total Excluded** | **72** | |
