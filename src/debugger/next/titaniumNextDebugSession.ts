import { InitializedEvent, LoggingDebugSession, OutputEvent, TerminatedEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { CDPConnection } from './v8/cdpConnection';

interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	platform: 'android';
	port: number;
	host?: string;
	trace?: boolean;
}

export class TitaniumNextDebugSession extends LoggingDebugSession {

	private connection?: CDPConnection;
	private attachStartedAt = 0;
	private trace = false;
	private clientInitiatedDisconnect = false;

	private logEvent(message: string): void {
		if (!this.trace) {
			return;
		}
		const elapsed = this.attachStartedAt ? `+${Date.now() - this.attachStartedAt}ms` : 'pre-attach';
		this.sendEvent(new OutputEvent(`titanium-next [${elapsed}]: ${message}\n`));
	}

	override initializeRequest(response: DebugProtocol.InitializeResponse, _args: DebugProtocol.InitializeRequestArguments): void {
		response.body = response.body ?? {};
		// Advertised so Phase 1c can use configurationDoneRequest as the "start running
		// after breakpoints are set" hook. Currently the handler just acks.
		response.body.supportsConfigurationDoneRequest = true;
		this.sendResponse(response);
	}

	override launchRequest(response: DebugProtocol.LaunchResponse, _args: DebugProtocol.LaunchRequestArguments): void {
		// Launch is not implemented yet — Phase 1f wires build orchestration.
		// Surface a clear error rather than silently terminating so users know what's
		// happening if they pick a launch config.
		this.sendErrorResponse(response, 1010, 'Launch is not yet implemented for \'titanium-next\'. Use \'attach\' instead.');
	}

	override async attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments): Promise<void> {
		this.attachStartedAt = Date.now();
		this.trace = args.trace === true;

		if (args.platform !== 'android') {
			this.sendErrorResponse(response, 1000, `Attach is only supported for platform 'android' (got '${args.platform}').`);
			return;
		}

		const host = args.host ?? 'localhost';
		const port = args.port;
		const url = `ws://${host}:${port}`;
		this.logEvent(`connecting to ${url}`);

		const connection = new CDPConnection(url);
		connection.on('close', () => {
			if (!this.clientInitiatedDisconnect) {
				this.sendEvent(new TerminatedEvent());
			}
		});

		try {
			// Titanium's V8 inspector exposes no Chrome-style discovery; connect
			// directly to the WebSocket at the inspector port. Matches what the
			// legacy adapter does in TitaniumTargetDiscovery.
			await connection.connect();
			this.connection = connection;
			this.logEvent('WebSocket connected');

			// Issue all four CDP messages in parallel rather than awaiting each in
			// series. The Titanium SDK queues inbound messages during its 60s wait
			// and only dispatches them to V8 after the wait ends — so awaiting one
			// response blocks all subsequent sends, and our magic-unlock message
			// (Runtime.runIfWaitingForDebugger) never reaches the SDK during the
			// wait. Sending in parallel ensures it arrives in the wait window.
			await Promise.all([
				connection.send('Runtime.enable'),
				connection.send('Debugger.enable'),
				// Phase 1b has no pause handling yet — tell V8 to ignore debugger;
				// statements and breakpoints so the JS thread never freezes (which
				// would block the app's main thread and trigger an Android ANR).
				// Phase 1c removes this and wires real pause/resume.
				connection.send('Debugger.setSkipAllPauses', { skip: true }),
				// Releases the Titanium SDK from its 60s wait in JSDebugger.waitForDebugger.
				connection.send('Runtime.runIfWaitingForDebugger'),
			]);
			this.logEvent('CDP domains enabled');

			this.sendResponse(response);
			this.sendEvent(new InitializedEvent());
		} catch (err) {
			connection.disconnect();
			this.connection = undefined;
			const message = err instanceof Error ? err.message : String(err);
			this.sendErrorResponse(response, 1002, `Attach failed: ${message}`);
		}
	}

	override configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, _args: DebugProtocol.ConfigurationDoneArguments): void {
		this.logEvent('configurationDone');
		// Runtime.runIfWaitingForDebugger is sent in attachRequest as part of the parallel
		// initial-message batch. Phase 1c will repurpose this handler for "start running
		// after breakpoints are set".
		this.sendResponse(response);
	}

	override disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
		this.clientInitiatedDisconnect = true;
		this.connection?.disconnect();
		this.connection = undefined;
		super.disconnectRequest(response, args);
	}
}
