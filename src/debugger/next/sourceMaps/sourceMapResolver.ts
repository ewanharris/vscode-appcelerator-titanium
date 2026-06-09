import { GeneratedLocation, Platform, ScriptInfo, SourceLocation } from './types';

export class SourceMapResolver {

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async init(_projectRoot: string, _platform: Platform): Promise<void> {
		throw new Error('SourceMapResolver.init not implemented');
	}

	listScripts(): ScriptInfo[] {
		return [];
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	generatedToSource(_url: string, _line: number, _column: number): SourceLocation | null {
		return null;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	sourceToGenerated(_absPath: string, _line: number, _column: number): GeneratedLocation[] {
		return [];
	}
}
