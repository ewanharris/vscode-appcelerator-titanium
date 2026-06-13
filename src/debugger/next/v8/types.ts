/** CDP types — only the fields the adapter actually uses. */

export interface CDPLocation {
	scriptId: string;
	lineNumber: number;   // 0-based
	columnNumber: number; // 0-based
}

export interface CDPCallFrame {
	callFrameId: string;
	functionName: string;
	location: CDPLocation;
	url: string;
}

export interface CDPPausedParams {
	callFrames: CDPCallFrame[];
	reason: string;
	hitBreakpoints?: string[];
}

export interface CDPScriptParsedParams {
	scriptId: string;
	url: string;
}

export interface CDPBreakpointResolvedParams {
	breakpointId: string;
	location: CDPLocation;
}

export interface CDPSetBreakpointByUrlParams {
	url: string;
	lineNumber: number;
	columnNumber?: number;
	condition?: string;
}

export interface CDPSetBreakpointByUrlResult {
	breakpointId: string;
	locations: CDPLocation[];
}
