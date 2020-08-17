# Telemetry data

This extension sends telemetry data to the AMPLIFY Platform to help us understand how the extension is used and how we can improve it. We send telemetry events for the following instances:

* When certain actions are performed
* When the extension is activated and deactivated

## Telemetry Data

### Telemetry Events

The following are the events sent by the extension:

* module.create
* app.create
* alloy.generate
* product.install

### Common Data

The following data is sent in every telemetry event:

| Name | Description | Classification | Purpose |
| -----| ----------- | -------------- |-------- |
| event | undefined | SystemMetaData | FeatureInsight |
| distribution.version | undefined | SystemMetaData | FeatureInsight |
| hardware.arch | undefined | EndUserPseudonymizedInformation | FeatureInsight |
| hardware.id | undefined | EndUserPseudonymizedInformation | FeatureInsight |
| os.name | undefined | SystemMetaData | FeatureInsight |
| os.version | undefined | SystemMetaData | FeatureInsight |
| data | undefined | SystemMetaData | FeatureInsight |
| packageid | undefined | EndUserPseudonymizedInformation | FeatureInsight |

### Event Specific Data

The following events send additional data:

#### module.create

| Name | Description | Classification | Purpose |
| -----| ----------- | -------------- |-------- |
| platforms | undefined | SystemMetaData | FeatureInsight |

#### app.create

| Name | Description | Classification | Purpose |
| -----| ----------- | -------------- |-------- |
| enableservices | undefined | SystemMetaData | FeatureInsight |
| platforms | undefined | SystemMetaData | FeatureInsight |

#### alloy.generate

| Name | Description | Classification | Purpose |
| -----| ----------- | -------------- |-------- |
| type | undefined | SystemMetaData | FeatureInsight |

#### product.install

| Name | Description | Classification | Purpose |
| -----| ----------- | -------------- |-------- |
| product | undefined | SystemMetaData | FeatureInsight |
| previous | undefined | SystemMetaData | FeatureInsight |
| new | undefined | SystemMetaData | FeatureInsight |
