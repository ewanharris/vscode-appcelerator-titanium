import { Event } from 'titanium-editor-commons/telemetry';

// Definitions for the GDPR tooling
export interface PropertyData {
	classification:
	| 'SystemMetaData'
	| 'CallstackOrException'
	| 'CustomerContent'
	| 'EndUserPseudonymizedInformation'
	| 'Unclassified';
	purpose: 'PerformanceAndHealth' | 'FeatureInsight' | 'BusinessInsight';
	endpoint?: string;
	isMeasurement?: boolean;
}

export interface GDPRProperty {
	readonly [name: string]: PropertyData | undefined | GDPRProperty;
}

export type ClassifiedEvent<T extends GDPRProperty> = {
	[k in keyof T]?: unknown
}

export type StrictPropertyCheck<
	TEvent,
	TClassifiedEvent,
	TError
> = keyof TEvent extends keyof TClassifiedEvent
	? keyof TClassifiedEvent extends keyof TEvent
		? TEvent
		: TError
	: TError;

export interface BaseEventClassification {
	// Classification properties from the base event in titanium-editor-commons
	event: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
	distribution: {
		version: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
	};
	hardware: {
		arch: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
		id: { classification: 'EndUserPseudonymizedInformation'; purpose: 'FeatureInsight' };
	};
	os: {
		name: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
		version: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
	};
	data: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
	// Properties added by this extension
	packageId?: { classification: 'EndUserPseudonymizedInformation'; purpose: 'FeatureInsight' };
	vsCodeVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
}

// Extend event as a partial because we know the properties from there will be added eventually,
// but we still want the required values from this extension to be enforced by tsc
export interface BaseEventMetrics extends Partial<Event> {
	packageId?: string;
	vsCodeVersion: string;
}

export interface AlloyGenerateEventClassification extends BaseEventClassification {
	type: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
}

export interface AlloyGenerateMetrics {
	type: string;
}

export interface CreationEventClassification extends BaseEventClassification {
	platforms: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
}

export interface CreationEventMetrics {
	platforms: string[];
}

export interface AppCreationEventClassification extends CreationEventClassification {
	enableServices: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'};
}

export interface AppCreationEventMetrics extends CreationEventMetrics {
	enableServices: boolean;
}

export interface AppBuildEventClassification extends BuildEventClassification {
	debug: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'};
}

export interface AppBuildEventMetrics extends BuildEventMetrics {
	debug?: boolean;
}

export interface BuildEventClassification extends BaseEventClassification {
	projectType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'};
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'};
	platform: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'};
}

export interface BuildEventMetrics {
	platform: string;
	projectType?: 'app' | 'module';
	target?: string;
}

export interface ProductInstallEventClassification extends BaseEventClassification {
	product: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
	previous: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
	new: { classification: 'SystemMetaData'; purpose: 'FeatureInsight' };
}

export interface ProductInstallEventMetrics {
	product: string;
	previous: string|undefined;
	new: string;
}
