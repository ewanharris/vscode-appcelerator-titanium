# Telemetry data

This extension sends telemetry data to the AMPLIFY Platform to help us understand how the extension is used and how we can improve it. We send telemetry events for the following instances:

* When certain actions are performed
* When the extension is activated and deactivated

## Telemetry Data

### Telemetry Events

The following are the events sent by the extension:

* distribute
* run
* module.create
* app.create
* alloy.generate
* product.install

### Common Data

The following data is sent in every telemetry event:

| Name | Classification | Purpose |
| -----| -------------- |-------- |
| event | SystemMetaData | FeatureInsight |
| distribution.version | SystemMetaData | FeatureInsight |
| hardware.arch | EndUserPseudonymizedInformation | FeatureInsight |
| hardware.id | EndUserPseudonymizedInformation | FeatureInsight |
| os.name | SystemMetaData | FeatureInsight |
| os.version | SystemMetaData | FeatureInsight |
| data | SystemMetaData | FeatureInsight |
| packageid | EndUserPseudonymizedInformation | FeatureInsight |
| vscodeversion | SystemMetaData | FeatureInsight |

### Event Specific Data

The following events send additional data:

#### distribute

| Name | Classification | Purpose |
| -----| -------------- |-------- |
| projecttype | SystemMetaData | FeatureInsight |
| target | SystemMetaData | FeatureInsight |
| platform | SystemMetaData | FeatureInsight |

#### run

| Name | Classification | Purpose |
| -----| -------------- |-------- |
| projecttype | SystemMetaData | FeatureInsight |
| target | SystemMetaData | FeatureInsight |
| platform | SystemMetaData | FeatureInsight |

#### module.create

| Name | Classification | Purpose |
| -----| -------------- |-------- |
| platforms | SystemMetaData | FeatureInsight |

#### app.create

| Name | Classification | Purpose |
| -----| -------------- |-------- |
| enableservices | SystemMetaData | FeatureInsight |
| platforms | SystemMetaData | FeatureInsight |

#### alloy.generate

| Name | Classification | Purpose |
| -----| -------------- |-------- |
| type | SystemMetaData | FeatureInsight |

#### product.install

| Name | Classification | Purpose |
| -----| -------------- |-------- |
| product | SystemMetaData | FeatureInsight |
| previous | SystemMetaData | FeatureInsight |
| new | SystemMetaData | FeatureInsight |
