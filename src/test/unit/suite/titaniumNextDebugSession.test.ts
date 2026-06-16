import { strict as assert } from 'assert';
import { AddressInfo } from 'net';
import * as path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { DebugProtocol } from '@vscode/debugprotocol';
import { TitaniumNextDebugSession } from '../../../debugger/next/titaniumNextDebugSession';
import { CDPSetBreakpointByUrlParams } from '../../../debugger/next/v8/types';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../../src/test/common/fixtures/debugger-next');
const CLASSIC_FIXTURE = path.join(FIXTURES_ROOT, 'classic');
const ALLOY_FIXTURE = path.join(FIXTURES_ROOT, 'alloy');

interface CDPRequest {
	id: number;
	method: string;
	params?: Record<string, unknown>;
}

// Helpers -----------------------------------------------------------------------

function makeAttachRequest(port: number, projectRoot: string, seq = 1): DebugProtocol.Request {
	return {
		type: 'request',
		seq,
		command: 'attach',
		arguments: { platform: 'android', port, projectRoot },
	};
}

function makeRequest(command: string, args: object = {}, seq = 1): DebugProtocol.Request {
	return { type: 'request', seq, command, arguments: args };
}

function waitForMessage(
	messages: DebugProtocol.ProtocolMessage[],
	predicate: (m: DebugProtocol.ProtocolMessage) => boolean,
	timeoutMs = 5000,
): Promise<DebugProtocol.ProtocolMessage> {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + timeoutMs;
		const check = () => {
			const found = messages.find(predicate);
			if (found) {
				resolve(found);
				return;
			}
			if (Date.now() >= deadline) {
				reject(new Error(`Timed out after ${timeoutMs}ms. Messages so far: ${messages.map(m => JSON.stringify(m)).join(', ')}`));
				return;
			}
			setTimeout(check, 10);
		};
		check();
	});
}

function isResponse(cmd: string) {
	return (m: DebugProtocol.ProtocolMessage): boolean =>
		m.type === 'response' && (m as DebugProtocol.Response).command === cmd;
}

function isEvent(evt: string) {
	return (m: DebugProtocol.ProtocolMessage): boolean =>
		m.type === 'event' && (m as DebugProtocol.Event).event === evt;
}

// Session test harness ----------------------------------------------------------

interface ServerState {
	server: WebSocketServer;
	port: number;
	receivedMethods: string[];
	receivedRequests: CDPRequest[];
	serverWs: WebSocket | undefined;
}

type MessageResponder = (req: CDPRequest, ws: WebSocket) => void;

function defaultResponder(req: CDPRequest, ws: WebSocket): void {
	ws.send(JSON.stringify({ id: req.id, result: {} }));
}

async function startFakeServer(responder: MessageResponder = defaultResponder): Promise<ServerState> {
	const server = await new Promise<WebSocketServer>(resolve => {
		const wss: WebSocketServer = new WebSocketServer({ port: 0 }, () => resolve(wss));
	});
	const port = (server.address() as AddressInfo).port;
	const state: ServerState = { server, port, receivedMethods: [], receivedRequests: [], serverWs: undefined };

	server.on('connection', ws => {
		state.serverWs = ws;
		ws.on('message', raw => {
			const req: CDPRequest = JSON.parse(raw.toString());
			state.receivedMethods.push(req.method);
			state.receivedRequests.push(req);
			responder(req, ws);
		});
	});

	return state;
}

async function stopFakeServer(state: ServerState): Promise<void> {
	state.serverWs?.terminate();
	await new Promise<void>(resolve => state.server.close(() => resolve()));
}

function serverSend(state: ServerState, data: object): void {
	assert.ok(state.serverWs, 'serverWs not connected');
	state.serverWs.send(JSON.stringify(data));
}

function waitForCdpMethod(
	state: ServerState,
	method: string,
	timeoutMs = 3000,
): Promise<CDPRequest> {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + timeoutMs;
		const check = () => {
			const found = state.receivedRequests.find(r => r.method === method);
			if (found) {
				resolve(found);
				return;
			}
			if (Date.now() >= deadline) {
				reject(new Error(`Timed out waiting for CDP ${method}. Received: ${state.receivedMethods.join(', ')}`));
				return;
			}
			setTimeout(check, 10);
		};
		check();
	});
}

// Attach + return both session + sent-message log ---------------------------------

async function attachSession(
	port: number,
	projectRoot: string,
): Promise<{ session: TitaniumNextDebugSession; messages: DebugProtocol.ProtocolMessage[] }> {
	const session = new TitaniumNextDebugSession();
	const messages: DebugProtocol.ProtocolMessage[] = [];
	// onDidSendMessage delivers an internal DebugProtocolMessage (structurally compatible)
	session.onDidSendMessage(m => messages.push(m as DebugProtocol.ProtocolMessage));
	session.handleMessage(makeAttachRequest(port, projectRoot));
	await waitForMessage(messages, isResponse('attach'));
	await waitForMessage(messages, isEvent('initialized'));
	return { session, messages };
}

// Tests -------------------------------------------------------------------------

describe('TitaniumNextDebugSession / attach', () => {
	let state: ServerState;

	beforeEach(async () => {
		state = await startFakeServer();
	});

	afterEach(async () => {
		await stopFakeServer(state);
	});

	it('sends an attach response and InitializedEvent on connect', async () => {
		const { messages } = await attachSession(state.port, CLASSIC_FIXTURE);
		assert.ok(messages.some(isResponse('attach')));
		assert.ok(messages.some(isEvent('initialized')));
	});

	it('reports supportsEvaluateForHovers in initialize response', async () => {
		const session = new TitaniumNextDebugSession();
		const messages: DebugProtocol.ProtocolMessage[] = [];
		session.onDidSendMessage(m => messages.push(m as DebugProtocol.ProtocolMessage));
		// pathFormat: 'path' is required — the base class sends an error response without it
		session.handleMessage(makeRequest('initialize', { adapterID: 'titanium-next', pathFormat: 'path' }));
		const resp = await waitForMessage(messages, isResponse('initialize')) as DebugProtocol.InitializeResponse;
		assert.equal(resp.body?.supportsEvaluateForHovers, true);
	});

	it('sends Runtime.enable and Debugger.enable during attach', async () => {
		await attachSession(state.port, CLASSIC_FIXTURE);
		await waitForCdpMethod(state, 'Runtime.enable');
		await waitForCdpMethod(state, 'Debugger.enable');
		assert.ok(state.receivedMethods.includes('Runtime.enable'));
		assert.ok(state.receivedMethods.includes('Debugger.enable'));
	});

	it('does NOT send Debugger.setSkipAllPauses during attach', async () => {
		await attachSession(state.port, CLASSIC_FIXTURE);
		// Give enables a moment to arrive
		await waitForCdpMethod(state, 'Debugger.enable');
		assert.ok(!state.receivedMethods.includes('Debugger.setSkipAllPauses'),
			'setSkipAllPauses workaround must be removed in phase 1c');
	});

	it('rejects with error response when platform is not android', async () => {
		const session = new TitaniumNextDebugSession();
		const messages: DebugProtocol.ProtocolMessage[] = [];
		session.onDidSendMessage(m => messages.push(m as DebugProtocol.ProtocolMessage));
		session.handleMessage(makeRequest('attach', { platform: 'ios', port: state.port, projectRoot: CLASSIC_FIXTURE }));
		const resp = await waitForMessage(messages, isResponse('attach')) as DebugProtocol.Response;
		assert.equal(resp.success, false);
	});
});

describe('TitaniumNextDebugSession / configurationDone', () => {
	let state: ServerState;

	beforeEach(async () => {
		state = await startFakeServer();
	});

	afterEach(async () => {
		await stopFakeServer(state);
	});

	it('sends Runtime.runIfWaitingForDebugger in configurationDone (not attach)', async () => {
		const { session } = await attachSession(state.port, CLASSIC_FIXTURE);

		// Should not have been sent yet
		assert.ok(!state.receivedMethods.includes('Runtime.runIfWaitingForDebugger'),
			'runIfWaitingForDebugger must be deferred until configurationDone');

		const messages: DebugProtocol.ProtocolMessage[] = [];
		session.onDidSendMessage(m => messages.push(m as DebugProtocol.ProtocolMessage));
		session.handleMessage(makeRequest('configurationDone'));
		await waitForMessage(messages, isResponse('configurationDone'));
		await waitForCdpMethod(state, 'Runtime.runIfWaitingForDebugger');
		assert.ok(state.receivedMethods.includes('Runtime.runIfWaitingForDebugger'));
	});
});

describe('TitaniumNextDebugSession / setBreakpoints (classic)', () => {
	let state: ServerState;

	beforeEach(async () => {
		state = await startFakeServer();
	});

	afterEach(async () => {
		await stopFakeServer(state);
	});

	it('sends Debugger.setBreakpointByUrl for a known source with correct V8 URL', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);
		const sourcePath = path.join(CLASSIC_FIXTURE, 'Resources', 'android', 'utils.js');

		session.handleMessage(makeRequest('setBreakpoints', {
			source: { path: sourcePath },
			breakpoints: [ { line: 1 } ],
		}));

		await waitForMessage(messages, isResponse('setBreakpoints'));
		const cdpReq = await waitForCdpMethod(state, 'Debugger.setBreakpointByUrl');
		assert.ok(cdpReq);
		const params = cdpReq.params as unknown as CDPSetBreakpointByUrlParams;
		assert.equal(params.url, '/utils.js');
		// CDP is 0-based lines; DAP line 1 → CDP lineNumber 0
		assert.equal(params.lineNumber, 0);
	});

	it('responds immediately with verified:false before CDP resolves', async () => {
		// Server holds back replies to setBreakpointByUrl so we can check the DAP
		// response arrives before the CDP round-trip completes.
		const slow = await startFakeServer((req, ws) => {
			if (req.method !== 'Debugger.setBreakpointByUrl') {
				ws.send(JSON.stringify({ id: req.id, result: {} }));
			}
		});

		try {
			const { session, messages } = await attachSession(slow.port, CLASSIC_FIXTURE);
			const sourcePath = path.join(CLASSIC_FIXTURE, 'Resources', 'android', 'utils.js');

			session.handleMessage(makeRequest('setBreakpoints', {
				source: { path: sourcePath },
				breakpoints: [ { line: 1 } ],
			}));

			// Response should arrive without waiting for CDP
			const resp = await waitForMessage(messages, isResponse('setBreakpoints')) as DebugProtocol.SetBreakpointsResponse;
			assert.ok(resp.success);
			assert.equal(resp.body.breakpoints.length, 1);
			assert.equal(resp.body.breakpoints[0].verified, false);
		} finally {
			await stopFakeServer(slow);
		}
	});

	it('emits BreakpointEvent with verified:true when CDP confirms', async () => {
		const withLocation = await startFakeServer((req, ws) => {
			if (req.method === 'Debugger.setBreakpointByUrl') {
				ws.send(JSON.stringify({
					id: req.id,
					result: {
						breakpointId: 'bp-1',
						locations: [ { scriptId: '1', lineNumber: 0, columnNumber: 0 } ],
					},
				}));
			} else {
				ws.send(JSON.stringify({ id: req.id, result: {} }));
			}
		});

		try {
			const { session, messages } = await attachSession(withLocation.port, CLASSIC_FIXTURE);
			const sourcePath = path.join(CLASSIC_FIXTURE, 'Resources', 'android', 'utils.js');

			session.handleMessage(makeRequest('setBreakpoints', {
				source: { path: sourcePath },
				breakpoints: [ { line: 1 } ],
			}));

			await waitForMessage(messages, isResponse('setBreakpoints'));
			const bpEvent = await waitForMessage(messages, m =>
				m.type === 'event' && (m as DebugProtocol.Event).event === 'breakpoint'
			) as DebugProtocol.BreakpointEvent;
			assert.equal(bpEvent.body.reason, 'changed');
			assert.equal(bpEvent.body.breakpoint.verified, true);
		} finally {
			await stopFakeServer(withLocation);
		}
	});

	it('returns unverified breakpoint for an unknown source (no CDP call)', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);
		const before = state.receivedMethods.length;

		session.handleMessage(makeRequest('setBreakpoints', {
			source: { path: '/unknown/file.js' },
			breakpoints: [ { line: 5 } ],
		}));

		const resp = await waitForMessage(messages, isResponse('setBreakpoints')) as DebugProtocol.SetBreakpointsResponse;
		assert.ok(resp.success);
		assert.equal(resp.body.breakpoints[0].verified, false);
		assert.equal(state.receivedMethods.length, before, 'no CDP call expected for unknown source');
	});

	it('emits verified BreakpointEvent on Debugger.breakpointResolved', async () => {
		// Set a breakpoint; server returns empty locations (script not loaded yet)
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);
		const sourcePath = path.join(CLASSIC_FIXTURE, 'Resources', 'android', 'utils.js');

		session.handleMessage(makeRequest('setBreakpoints', {
			source: { path: sourcePath },
			breakpoints: [ { line: 1 } ],
		}));

		await waitForMessage(messages, isResponse('setBreakpoints'));
		// Wait for the setBreakpointByUrl CDP call and get its breakpointId from the response
		const cdpReq = await waitForCdpMethod(state, 'Debugger.setBreakpointByUrl');
		assert.ok(cdpReq);

		// Now the server fires breakpointResolved (script loaded, breakpoint snapped)
		serverSend(state, {
			method: 'Debugger.breakpointResolved',
			params: {
				breakpointId: cdpReq.id.toString(), // our fake server echoes back the request id as result.breakpointId
				location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
			},
		});

		// We need the cdpBreakpointId to have been stored on the active bp first.
		// The fake server responded with {} so breakpointId is undefined — simulate
		// a proper response by directly firing the event with the known id.
		// Instead, use a server that returns a real breakpointId:
		const withBpId = await startFakeServer((req, ws) => {
			if (req.method === 'Debugger.setBreakpointByUrl') {
				ws.send(JSON.stringify({ id: req.id, result: { breakpointId: 'cdp-bp-1', locations: [] } }));
			} else {
				ws.send(JSON.stringify({ id: req.id, result: {} }));
			}
		});

		try {
			const { session: sess2, messages: msgs2 } = await attachSession(withBpId.port, CLASSIC_FIXTURE);
			sess2.handleMessage(makeRequest('setBreakpoints', {
				source: { path: sourcePath },
				breakpoints: [ { line: 1 } ],
			}));

			await waitForMessage(msgs2, isResponse('setBreakpoints'));
			// Wait for the initial unresolved BreakpointEvent
			await waitForMessage(msgs2, m =>
				m.type === 'event' && (m as DebugProtocol.Event).event === 'breakpoint'
			);

			// Server fires breakpointResolved for the same id
			serverSend(withBpId, {
				method: 'Debugger.breakpointResolved',
				params: {
					breakpointId: 'cdp-bp-1',
					location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
				},
			});

			const resolved = await waitForMessage(msgs2, m => {
				if (m.type !== 'event' || (m as DebugProtocol.Event).event !== 'breakpoint') {
					return false;
				}
				return (m as DebugProtocol.BreakpointEvent).body.breakpoint.verified === true;
			}) as DebugProtocol.BreakpointEvent;
			assert.equal(resolved.body.breakpoint.verified, true);
		} finally {
			await stopFakeServer(withBpId);
		}
	});

	it('deduplicates breakpoints that map to the same generated location within one round', async () => {
		// Two breakpoints at the same user line both resolve to the same generated location.
		// Only one Debugger.setBreakpointByUrl should be sent; the second is a duplicate.
		const withBpId = await startFakeServer((req, ws) => {
			if (req.method === 'Debugger.setBreakpointByUrl') {
				ws.send(JSON.stringify({ id: req.id, result: { breakpointId: 'cdp-dedup', locations: [] } }));
			} else {
				ws.send(JSON.stringify({ id: req.id, result: {} }));
			}
		});

		try {
			const { session, messages } = await attachSession(withBpId.port, CLASSIC_FIXTURE);
			const sourcePath = path.join(CLASSIC_FIXTURE, 'Resources', 'android', 'utils.js');

			// Send line 1 twice — both map to the same generated location.
			session.handleMessage(makeRequest('setBreakpoints', {
				source: { path: sourcePath },
				breakpoints: [ { line: 1 }, { line: 1 } ],
			}));

			await waitForMessage(messages, isResponse('setBreakpoints'));
			// Allow CDP round to complete
			await new Promise(r => setTimeout(r, 100));

			const setBpCalls = withBpId.receivedRequests.filter(r => r.method === 'Debugger.setBreakpointByUrl');
			assert.equal(setBpCalls.length, 1, 'only one setBreakpointByUrl should be sent for duplicate locations');
		} finally {
			await stopFakeServer(withBpId);
		}
	});

	it('does not produce "already exists" when setBreakpoints is called twice rapidly', async () => {
		// Both rounds are fired before CDP responses arrive. The serial queue must
		// ensure round-2 removes happen before round-2 sets.
		const errors: string[] = [];
		const withBpId = await startFakeServer((req, ws) => {
			if (req.method === 'Debugger.setBreakpointByUrl') {
				ws.send(JSON.stringify({ id: req.id, result: { breakpointId: `bp-${req.id}`, locations: [] } }));
			} else {
				ws.send(JSON.stringify({ id: req.id, result: {} }));
			}
		});

		try {
			const { session, messages } = await attachSession(withBpId.port, CLASSIC_FIXTURE);
			const sourcePath = path.join(CLASSIC_FIXTURE, 'Resources', 'android', 'utils.js');

			// Round 1
			session.handleMessage(makeRequest('setBreakpoints', {
				source: { path: sourcePath },
				breakpoints: [ { line: 1 } ],
			}, 1));
			await waitForMessage(messages, isResponse('setBreakpoints'));

			// Round 2 — immediately after, before CDP might have responded
			session.handleMessage(makeRequest('setBreakpoints', {
				source: { path: sourcePath },
				breakpoints: [ { line: 1 } ],
			}, 2));
			await waitForMessage(messages, (m) => isResponse('setBreakpoints')(m) && (m as DebugProtocol.Response).request_seq === 2);

			// Wait for both CDP rounds to complete
			await new Promise(r => setTimeout(r, 200));

			assert.equal(errors.length, 0, `unexpected errors: ${errors.join(', ')}`);
			// Only one setBreakpointByUrl should be active (not two for same location)
			const setBpCalls = withBpId.receivedRequests.filter(r => r.method === 'Debugger.setBreakpointByUrl');
			const removeCalls = withBpId.receivedRequests.filter(r => r.method === 'Debugger.removeBreakpoint');
			// Round 2 must have removed round 1's bp before setting a new one
			assert.ok(setBpCalls.length >= 2, 'expected at least 2 setBreakpointByUrl calls (one per round)');
			assert.ok(removeCalls.length >= 1, 'expected at least 1 removeBreakpoint call (round-2 cleanup)');
		} finally {
			await stopFakeServer(withBpId);
		}
	});
});

describe('TitaniumNextDebugSession / pause and resume', () => {
	let state: ServerState;

	beforeEach(async () => {
		state = await startFakeServer();
	});

	afterEach(async () => {
		await stopFakeServer(state);
	});

	it('emits StoppedEvent with reason "breakpoint" when hitBreakpoints is non-empty', async () => {
		const { messages } = await attachSession(state.port, CLASSIC_FIXTURE);
		await waitForCdpMethod(state, 'Debugger.enable');

		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: 'doSomething',
					location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
					url: '/utils.js',
				} ],
				reason: 'other',
				hitBreakpoints: [ 'bp-123' ],
			},
		});

		const stopped = await waitForMessage(messages, isEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(stopped.body.reason, 'breakpoint');
		assert.equal(stopped.body.threadId, 1);
	});

	it('emits StoppedEvent with reason "step" when hitBreakpoints is absent', async () => {
		const { messages } = await attachSession(state.port, CLASSIC_FIXTURE);
		await waitForCdpMethod(state, 'Debugger.enable');

		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: 'doSomething',
					location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
					url: '/utils.js',
				} ],
				reason: 'other',
			},
		});

		const stopped = await waitForMessage(messages, isEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(stopped.body.reason, 'step');
		assert.equal(stopped.body.threadId, 1);
	});

	it('sends Debugger.resume on continueRequest', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		session.handleMessage(makeRequest('continue', { threadId: 1 }));

		const resp = await waitForMessage(messages, isResponse('continue')) as DebugProtocol.ContinueResponse;
		assert.ok(resp.success);
		await waitForCdpMethod(state, 'Debugger.resume');
		assert.ok(state.receivedMethods.includes('Debugger.resume'));
	});

	it('returns a single thread from threadsRequest', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		session.handleMessage(makeRequest('threads'));

		const resp = await waitForMessage(messages, isResponse('threads')) as DebugProtocol.ThreadsResponse;
		assert.ok(resp.success);
		assert.equal(resp.body.threads.length, 1);
		assert.equal(resp.body.threads[0].id, 1);
	});

	it('sends Debugger.stepOver on nextRequest and emits ContinuedEvent', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		// Put the session into a paused state first
		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: 'doSomething',
					location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
					url: '/utils.js',
				} ],
				reason: 'other',
				hitBreakpoints: [ 'bp-1' ],
			},
		});
		await waitForMessage(messages, isEvent('stopped'));

		session.handleMessage(makeRequest('next', { threadId: 1 }));

		const resp = await waitForMessage(messages, isResponse('next')) as DebugProtocol.NextResponse;
		assert.ok(resp.success);
		await waitForCdpMethod(state, 'Debugger.stepOver');
		assert.ok(state.receivedMethods.includes('Debugger.stepOver'));
		assert.ok(messages.some(isEvent('continued')), 'ContinuedEvent must be emitted');
	});

	it('sends Debugger.stepInto on stepInRequest and emits ContinuedEvent', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: 'doSomething',
					location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
					url: '/utils.js',
				} ],
				reason: 'other',
				hitBreakpoints: [ 'bp-1' ],
			},
		});
		await waitForMessage(messages, isEvent('stopped'));

		session.handleMessage(makeRequest('stepIn', { threadId: 1 }));

		const resp = await waitForMessage(messages, isResponse('stepIn')) as DebugProtocol.StepInResponse;
		assert.ok(resp.success);
		await waitForCdpMethod(state, 'Debugger.stepInto');
		assert.ok(state.receivedMethods.includes('Debugger.stepInto'));
		assert.ok(messages.some(isEvent('continued')), 'ContinuedEvent must be emitted');
	});

	it('sends Debugger.stepOut on stepOutRequest and emits ContinuedEvent', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: 'doSomething',
					location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
					url: '/utils.js',
				} ],
				reason: 'other',
				hitBreakpoints: [ 'bp-1' ],
			},
		});
		await waitForMessage(messages, isEvent('stopped'));

		session.handleMessage(makeRequest('stepOut', { threadId: 1 }));

		const resp = await waitForMessage(messages, isResponse('stepOut')) as DebugProtocol.StepOutResponse;
		assert.ok(resp.success);
		await waitForCdpMethod(state, 'Debugger.stepOut');
		assert.ok(state.receivedMethods.includes('Debugger.stepOut'));
		assert.ok(messages.some(isEvent('continued')), 'ContinuedEvent must be emitted');
	});

	it('emits StoppedEvent with reason "step" after a step lands on a new line', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		// First pause at a breakpoint
		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: 'doSomething',
					location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
					url: '/utils.js',
				} ],
				reason: 'other',
				hitBreakpoints: [ 'bp-1' ],
			},
		});
		await waitForMessage(messages, isEvent('stopped'));

		// Issue a step
		session.handleMessage(makeRequest('next', { threadId: 1 }));
		await waitForMessage(messages, isResponse('next'));
		await waitForCdpMethod(state, 'Debugger.stepOver');

		// V8 emits another paused with no hitBreakpoints (stepped to next line)
		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-2',
					functionName: 'doSomething',
					location: { scriptId: 'script-1', lineNumber: 1, columnNumber: 0 },
					url: '/utils.js',
				} ],
				reason: 'other',
			},
		});

		const stoppedAfterStep = await waitForMessage(messages, m => {
			if (!isEvent('stopped')(m)) {
				return false;
			}
			return (m as DebugProtocol.StoppedEvent).body.reason === 'step';
		}) as DebugProtocol.StoppedEvent;
		assert.equal(stoppedAfterStep.body.reason, 'step');
	});
});

describe('TitaniumNextDebugSession / stackTrace', () => {
	let state: ServerState;

	beforeEach(async () => {
		state = await startFakeServer();
	});

	afterEach(async () => {
		await stopFakeServer(state);
	});

	it('translates V8 frame to user source via resolver on stackTrace', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		// Register script mapping
		serverSend(state, {
			method: 'Debugger.scriptParsed',
			params: { scriptId: 'script-utils', url: '/utils.js' },
		});

		// Pause on utils.js line 1 (CDP 0-based = lineNumber:0)
		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: 'myFunc',
					location: { scriptId: 'script-utils', lineNumber: 0, columnNumber: 0 },
					url: '/utils.js',
				} ],
				reason: 'breakpoint',
			},
		});

		await waitForMessage(messages, isEvent('stopped'));

		session.handleMessage(makeRequest('stackTrace', { threadId: 1 }));

		const resp = await waitForMessage(messages, isResponse('stackTrace')) as DebugProtocol.StackTraceResponse;
		assert.ok(resp.success);
		assert.ok(resp.body.stackFrames.length >= 1);
		const frame = resp.body.stackFrames[0];
		// The resolver maps /utils.js to Resources/android/utils.js (the platform override)
		assert.ok(frame.source?.path?.endsWith(path.join('Resources', 'android', 'utils.js')),
			`expected android override; got ${frame.source?.path}`);
		assert.equal(frame.name, 'myFunc');
	});

	it('auto-resumes when paused in a non-user script (SDK internal)', async () => {
		// ti.main.js is in the fixture assets but has no source map → not a known user script.
		// The session should auto-resume instead of emitting StoppedEvent.
		const { messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		serverSend(state, {
			method: 'Debugger.scriptParsed',
			params: { scriptId: 'script-ti-main', url: '/ti.main.js' },
		});
		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: '',
					location: { scriptId: 'script-ti-main', lineNumber: 0, columnNumber: 0 },
					url: '/ti.main.js',
				} ],
				reason: 'PauseOnNextStatement',
			},
		});

		// Should resume, not stop
		await waitForCdpMethod(state, 'Debugger.resume');
		assert.ok(!messages.some(isEvent('stopped')), 'StoppedEvent must not be emitted for SDK-internal pause');
	});

	it('auto-resumes when paused in a truly internal script not in build assets', async () => {
		const { messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		serverSend(state, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: '',
					location: { scriptId: 'unknown-id', lineNumber: 2, columnNumber: 0 },
					url: 'ti:/kroll.js',
				} ],
				reason: 'other',
			},
		});

		await waitForCdpMethod(state, 'Debugger.resume');
		assert.ok(!messages.some(isEvent('stopped')), 'StoppedEvent must not be emitted for internal pause');
	});
});

describe('TitaniumNextDebugSession / alloy fixture', () => {
	let state: ServerState;

	beforeEach(async () => {
		state = await startFakeServer();
	});

	afterEach(async () => {
		await stopFakeServer(state);
	});

	it('sets breakpoint by URL for an alloy controller source', async () => {
		const { session, messages } = await attachSession(state.port, ALLOY_FIXTURE);
		const sourcePath = path.join(ALLOY_FIXTURE, 'app', 'controllers', 'android', 'index.js');

		session.handleMessage(makeRequest('setBreakpoints', {
			source: { path: sourcePath },
			breakpoints: [ { line: 1 } ],
		}));

		await waitForMessage(messages, isResponse('setBreakpoints'));
		const cdpReq = await waitForCdpMethod(state, 'Debugger.setBreakpointByUrl');
		assert.equal((cdpReq.params as unknown as CDPSetBreakpointByUrlParams).url, '/alloy/controllers/index.js');
	});
});

describe('TitaniumNextDebugSession / scopes and variables', () => {
	let state: ServerState;

	function pauseWithScopes(st: ServerState): void {
		serverSend(st, {
			method: 'Debugger.paused',
			params: {
				callFrames: [ {
					callFrameId: 'cf-1',
					functionName: 'doSomething',
					location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
					url: '/utils.js',
					scopeChain: [
						{ type: 'local', object: { type: 'object', objectId: 'local-obj-1', description: 'Object' } },
						{ type: 'global', object: { type: 'object', objectId: 'global-obj-1', description: 'Window' } },
					],
				} ],
				reason: 'other',
				hitBreakpoints: [ 'bp-1' ],
			},
		});
	}

	beforeEach(async () => {
		state = await startFakeServer((req, ws) => {
			if (req.method === 'Runtime.getProperties') {
				ws.send(JSON.stringify({ id: req.id, result: { result: [] } }));
			} else {
				ws.send(JSON.stringify({ id: req.id, result: {} }));
			}
		});
	});

	afterEach(async () => {
		await stopFakeServer(state);
	});

	it('scopesRequest returns scope names and non-zero variablesReferences', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);
		pauseWithScopes(state);
		await waitForMessage(messages, isEvent('stopped'));

		session.handleMessage(makeRequest('scopes', { frameId: 0 }));
		const resp = await waitForMessage(messages, isResponse('scopes')) as DebugProtocol.ScopesResponse;

		assert.ok(resp.success);
		assert.equal(resp.body.scopes.length, 2);
		const [ local, global ] = resp.body.scopes;
		assert.equal(local.name, 'Local');
		assert.ok(local.variablesReference > 0);
		assert.equal(local.expensive, false);
		assert.equal(global.name, 'Global');
		assert.ok(global.variablesReference > 0);
		assert.equal(global.expensive, true);
	});

	it('scopesRequest returns empty scopes when not paused', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);

		session.handleMessage(makeRequest('scopes', { frameId: 0 }));
		const resp = await waitForMessage(messages, isResponse('scopes')) as DebugProtocol.ScopesResponse;

		assert.ok(resp.success);
		assert.equal(resp.body.scopes.length, 0);
	});

	it('variablesRequest sends Runtime.getProperties with the correct objectId', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);
		pauseWithScopes(state);
		await waitForMessage(messages, isEvent('stopped'));

		session.handleMessage(makeRequest('scopes', { frameId: 0 }));
		const scopesResp = await waitForMessage(messages, isResponse('scopes')) as DebugProtocol.ScopesResponse;
		const localRef = scopesResp.body.scopes[0].variablesReference;

		session.handleMessage(makeRequest('variables', { variablesReference: localRef }));
		await waitForMessage(messages, isResponse('variables'));

		const getPropsReq = await waitForCdpMethod(state, 'Runtime.getProperties');
		assert.equal(getPropsReq.params?.objectId, 'local-obj-1');
	});

	it('variablesRequest maps property descriptors to DAP Variables with correct values and references', async () => {
		const withProps = await startFakeServer((req, ws) => {
			if (req.method === 'Runtime.getProperties') {
				ws.send(JSON.stringify({ id: req.id, result: { result: [
					{ name: 'x',          value: { type: 'number',    value: 42,      description: '42'    }, enumerable: true  },
					{ name: 'msg',        value: { type: 'string',    value: 'hello'                       }, enumerable: true  },
					{ name: 'obj',        value: { type: 'object',    objectId: 'nested-obj', description: 'Object' }, enumerable: true  },
					{ name: '__hidden__', value: { type: 'string',    value: 'secret'                      }, enumerable: false },
				] } }));
			} else {
				ws.send(JSON.stringify({ id: req.id, result: {} }));
			}
		});

		try {
			const { session, messages } = await attachSession(withProps.port, CLASSIC_FIXTURE);
			serverSend(withProps, {
				method: 'Debugger.paused',
				params: {
					callFrames: [ {
						callFrameId: 'cf-1',
						functionName: 'fn',
						location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
						url: '/utils.js',
						scopeChain: [
							{ type: 'local', object: { type: 'object', objectId: 'local-obj', description: 'Object' } },
						],
					} ],
					reason: 'other',
					hitBreakpoints: [ 'bp-1' ],
				},
			});
			await waitForMessage(messages, isEvent('stopped'));

			session.handleMessage(makeRequest('scopes', { frameId: 0 }));
			const scopesResp = await waitForMessage(messages, isResponse('scopes')) as DebugProtocol.ScopesResponse;
			const localRef = scopesResp.body.scopes[0].variablesReference;

			session.handleMessage(makeRequest('variables', { variablesReference: localRef }));
			const varResp = await waitForMessage(messages, isResponse('variables')) as DebugProtocol.VariablesResponse;

			assert.ok(varResp.success);
			// Non-enumerable property is filtered out
			assert.equal(varResp.body.variables.length, 3);
			const [ xVar, msgVar, objVar ] = varResp.body.variables;
			assert.equal(xVar.name, 'x');
			assert.equal(xVar.value, '42');
			assert.equal(xVar.variablesReference, 0);
			assert.equal(msgVar.name, 'msg');
			assert.equal(msgVar.value, 'hello');
			assert.equal(msgVar.variablesReference, 0);
			assert.equal(objVar.name, 'obj');
			assert.equal(objVar.value, 'Object');
			assert.ok(objVar.variablesReference > 0, 'object property must have non-zero variablesReference');
		} finally {
			await stopFakeServer(withProps);
		}
	});

	it('stale variablesReference after continue returns empty variables without a CDP call', async () => {
		const { session, messages } = await attachSession(state.port, CLASSIC_FIXTURE);
		pauseWithScopes(state);
		await waitForMessage(messages, isEvent('stopped'));

		session.handleMessage(makeRequest('scopes', { frameId: 0 }));
		const scopesResp = await waitForMessage(messages, isResponse('scopes')) as DebugProtocol.ScopesResponse;
		const localRef = scopesResp.body.scopes[0].variablesReference;

		// Continue clears the handle map
		session.handleMessage(makeRequest('continue', { threadId: 1 }));
		await waitForMessage(messages, isResponse('continue'));

		const prevCount = state.receivedRequests.length;

		session.handleMessage(makeRequest('variables', { variablesReference: localRef }));
		const varResp = await waitForMessage(messages, isResponse('variables')) as DebugProtocol.VariablesResponse;

		assert.ok(varResp.success);
		assert.equal(varResp.body.variables.length, 0);
		assert.equal(state.receivedRequests.length, prevCount, 'no CDP call should be made for a stale handle');
	});

	it('evaluateRequest with frameId sends Debugger.evaluateOnCallFrame', async () => {
		const withEval = await startFakeServer((req, ws) => {
			if (req.method === 'Debugger.evaluateOnCallFrame') {
				ws.send(JSON.stringify({ id: req.id, result: { result: { type: 'number', value: 99, description: '99' } } }));
			} else {
				ws.send(JSON.stringify({ id: req.id, result: {} }));
			}
		});

		try {
			const { session, messages } = await attachSession(withEval.port, CLASSIC_FIXTURE);
			serverSend(withEval, {
				method: 'Debugger.paused',
				params: {
					callFrames: [ {
						callFrameId: 'cf-eval',
						functionName: 'fn',
						location: { scriptId: 'script-1', lineNumber: 0, columnNumber: 0 },
						url: '/utils.js',
						scopeChain: [],
					} ],
					reason: 'other',
					hitBreakpoints: [ 'bp-1' ],
				},
			});
			await waitForMessage(messages, isEvent('stopped'));

			session.handleMessage(makeRequest('evaluate', { expression: '1 + 1', frameId: 0, context: 'hover' }));
			const evalResp = await waitForMessage(messages, isResponse('evaluate')) as DebugProtocol.EvaluateResponse;

			assert.ok(evalResp.success);
			assert.equal(evalResp.body.result, '99');
			assert.equal(evalResp.body.variablesReference, 0);

			const evalReq = await waitForCdpMethod(withEval, 'Debugger.evaluateOnCallFrame');
			assert.equal(evalReq.params?.callFrameId, 'cf-eval');
			assert.equal(evalReq.params?.expression, '1 + 1');
		} finally {
			await stopFakeServer(withEval);
		}
	});

	it('evaluateRequest without frameId sends Runtime.evaluate', async () => {
		const withEval = await startFakeServer((req, ws) => {
			if (req.method === 'Runtime.evaluate') {
				ws.send(JSON.stringify({ id: req.id, result: { result: { type: 'string', value: 'world' } } }));
			} else {
				ws.send(JSON.stringify({ id: req.id, result: {} }));
			}
		});

		try {
			const { session, messages } = await attachSession(withEval.port, CLASSIC_FIXTURE);

			session.handleMessage(makeRequest('evaluate', { expression: 'greeting', context: 'repl' }));
			const evalResp = await waitForMessage(messages, isResponse('evaluate')) as DebugProtocol.EvaluateResponse;

			assert.ok(evalResp.success);
			assert.equal(evalResp.body.result, 'world');
			assert.equal(evalResp.body.variablesReference, 0);

			const evalReq = await waitForCdpMethod(withEval, 'Runtime.evaluate');
			assert.equal(evalReq.params?.expression, 'greeting');
		} finally {
			await stopFakeServer(withEval);
		}
	});
});
