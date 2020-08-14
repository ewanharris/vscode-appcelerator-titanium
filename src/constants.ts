export const ExtensionId = 'titanium';

export const ExtensionQualifiedId = `axway.vscode-${ExtensionId}`;

export enum VSCodeCommands {
	OpenFolder = 'vscode.openFolder',
	SetContext = 'setContext'
}

export enum CommandContext {

}

export enum GlobalState {
	Enabled = 'titanium:enabled',
	Liveview = 'titanium:liveview',
	Running = 'titanium:build:running',
	LastUpdateCheck = 'titanium:update:lastCheck',
	HasUpdates = 'titanium:update:hasUpdates'
}

export enum WorkspaceState {
	LastBuildState = 'lastRunOptions',
	LastPackageState = 'lastDistOptions',
	LastKeystorePath = 'lastKeystorePath',
	LastCreationPath = 'lastCreationPath',
	LastAndroidDebug = 'lastAndroidDebugOptions',
	LastiOSDebug = 'lastiOSDebugOptions'
}
