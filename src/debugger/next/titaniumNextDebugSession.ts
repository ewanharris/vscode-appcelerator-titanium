import { InitializedEvent, LoggingDebugSession, OutputEvent, TerminatedEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';

export class TitaniumNextDebugSession extends LoggingDebugSession {

	override initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
		response.body = response.body ?? {};
		this.sendResponse(response);
	}

	override launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments): void {
		this.sendEvent(new InitializedEvent());
		this.sendEvent(new OutputEvent('titanium-next: launchRequest received\n'));
		this.sendEvent(new TerminatedEvent());
		this.sendResponse(response);
	}

	override attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments): void {
		this.sendEvent(new InitializedEvent());
		this.sendEvent(new OutputEvent('titanium-next: attachRequest received\n'));
		this.sendEvent(new TerminatedEvent());
		this.sendResponse(response);
	}
}

