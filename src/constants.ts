export const ExtensionName = 'titanium';
export const ExtensionId = 'axway.vscode-titanium';
export const TelemetryGuid = 'e49527c9-168f-47b4-97f2-13f218020b69';

export enum VSCodeCommands {
	OpenFolder = 'vscode.openFolder',
	ReportIssue = 'vscode.openIssueReporter',
	SetContext = 'setContext',
	OpenSettings = 'workbench.action.openSettings'
}

export enum CommandContext {

}

export enum GlobalState {
	Enabled = 'titanium:enabled',
	Liveview = 'titanium:liveview',
	Running = 'titanium:build:running',
	LastUpdateCheck = 'titanium:update:lastCheck',
	HasUpdates = 'titanium:update:hasUpdates',
	RefreshEnvironment = 'titanium:environment:refresh',
	MissingTooling = 'titanium:toolingMissing',
	NotTitaniumProject = 'titanium:notProject',
	TelemetryEnabled = 'titanium:telemetry:enabled'
}

export enum WorkspaceState {
	LastBuildState = 'lastRunOptions',
	LastPackageState = 'lastDistOptions',
	LastKeystorePath = 'lastKeystorePath',
	LastCreationPath = 'lastCreationPath',
	LastAndroidDebug = 'lastAndroidDebugOptions',
	LastiOSDebug = 'lastiOSDebugOptions'
}
