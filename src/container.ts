import { ExtensionContext, TaskExecution, extensions } from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { Telemetry } from 'titanium-editor-commons';
import appc, { Appc } from './appc';
import { Config, configuration } from './configuration';
import { ExtensionQualifiedId } from './constants';
import Terminal from './terminal';

export class ExtensionContainer {
	private static _appc: Appc;
	private static _config: Config | undefined;
	private static _context: ExtensionContext;
	private static _terminal: Terminal;
	private static _runningTask: TaskExecution|undefined;
	private static _telemetry: Telemetry;

	public static inititalize (context: ExtensionContext, config: Config): void {
		this._appc = appc;
		this._config = config;
		this._context = context;
		this._telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: 'e49527c9-168f-47b4-97f2-13f218020b69',
			productVersion: extensions.getExtension(ExtensionQualifiedId)!.packageJSON.version,
			persistDirectory: path.join(os.homedir(), '.titanium', 'vscode-telemetry')
		});
	}

	static get appc (): Appc {
		return this._appc;
	}

	static get config (): Config {
		if (this._config === undefined) {
			this._config = configuration.get<Config>();
		}
		return this._config;
	}

	static get context (): ExtensionContext {
		return this._context;
	}

	static get terminal (): Terminal {
		if (this._terminal === undefined) {
			this._terminal = new Terminal('Appcelerator');
		}
		return this._terminal;
	}

	static get telemetry (): Telemetry {
		return this._telemetry;
	}

	public static resetConfig (): void {
		this._config = undefined;
	}

	static set runningTask (task: TaskExecution|undefined) {
		this._runningTask = task;
	}

	static get runningTask (): TaskExecution|undefined {
		return this._runningTask;
	}
}
