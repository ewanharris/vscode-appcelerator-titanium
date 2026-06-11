import * as fs from 'fs/promises';
import * as path from 'path';
import { RawSourceMap, SourceMapConsumer } from 'source-map';
import { detectProjectType } from './projectType';
import { extractInlineMap } from './inlineMap';
import { rebaseSourcePath } from './paths';
import { GeneratedLocation, Platform, ScriptInfo, SourceLocation } from './types';

interface MapEntry {
	consumer: SourceMapConsumer;
	sourceRoot: string | undefined;
	rawSources: string[];
}

interface ResolvedScript {
	v8url: string;
	generatedFile: string;
	userSources: string[];
	inline: MapEntry;
	// Set for Alloy scripts that have a sidecar map. Two-stage chain lands in a
	// follow-up commit; for now Alloy classic-style attaches still work via the
	// inline map alone (line numbers may be off by a babel-pass shift).
	alloy?: MapEntry;
	// Map from rebased absolute source path back to the raw source name used by
	// the map that owns it. Needed for sourceToGenerated, since the source-map
	// library indexes mappings by original-source name, not rebased path.
	sourceNameByAbsPath: Map<string, { stage: 'inline' | 'alloy'; rawName: string }>;
}

const ANDROID_ASSETS_REL = [ 'build', 'android', 'assets' ];
const ANDROID_MAP_REL = [ 'build', 'map', 'Resources', 'android' ];

export class SourceMapResolver {

	private projectRoot = '';
	private readonly scripts = new Map<string, ResolvedScript>();
	private readonly scriptsBySource = new Map<string, ResolvedScript[]>();

	async init(projectRoot: string, platform: Platform): Promise<void> {
		if (platform !== 'android') {
			throw new Error(`SourceMapResolver: only 'android' is supported in Phase 1c; got '${platform}'`);
		}
		this.projectRoot = projectRoot;
		const projectType = await detectProjectType(projectRoot);
		const assetsDir = path.join(projectRoot, ...ANDROID_ASSETS_REL);
		const jsFiles = await walkJs(assetsDir);

		for (const generatedFile of jsFiles) {
			const rel = path.relative(assetsDir, generatedFile).split(path.sep).join('/');
			const v8url = '/' + rel;
			const fileText = await fs.readFile(generatedFile, 'utf8');
			const rawInline = extractInlineMap(fileText);
			if (!rawInline) {
				continue;
			}

			const inline = await loadMapEntry(rawInline);
			let alloy: MapEntry | undefined;
			if (projectType === 'alloy') {
				const alloyMapPath = path.join(projectRoot, ...ANDROID_MAP_REL, ...rel.split('/')) + '.map';
				const rawAlloy = await tryReadRawMap(alloyMapPath);
				if (rawAlloy) {
					alloy = await loadMapEntry(rawAlloy);
				}
			}

			const owningEntry = alloy ?? inline;
			const sourceNameByAbsPath = new Map<string, { stage: 'inline' | 'alloy'; rawName: string }>();
			const userSources: string[] = [];
			for (const rawName of owningEntry.rawSources) {
				const rebased = rebaseSourcePath(rawName, owningEntry.sourceRoot, projectRoot);
				if (!rebased) {
					continue;
				}
				userSources.push(rebased);
				sourceNameByAbsPath.set(rebased, { stage: alloy ? 'alloy' : 'inline', rawName });
			}

			const script: ResolvedScript = { v8url, generatedFile, userSources, inline, alloy, sourceNameByAbsPath };
			this.scripts.set(v8url, script);
			for (const src of userSources) {
				const list = this.scriptsBySource.get(src) ?? [];
				list.push(script);
				this.scriptsBySource.set(src, list);
			}
		}
	}

	listScripts(): ScriptInfo[] {
		return Array.from(this.scripts.values()).map(s => ({
			v8url: s.v8url,
			generatedFile: s.generatedFile,
			userSources: [ ...s.userSources ],
		}));
	}

	generatedToSource(url: string, line: number, column: number): SourceLocation | null {
		const script = this.scripts.get(url);
		if (!script) {
			return null;
		}
		const inlinePos = script.inline.consumer.originalPositionFor({ line, column });
		if (inlinePos.line === null) {
			return null;
		}
		if (script.alloy) {
			// Phase 1c-α implements classic only; alloy chain follows.
			return null;
		}
		if (inlinePos.source === null) {
			return null;
		}
		const rebased = rebaseSourcePath(inlinePos.source, script.inline.sourceRoot, this.projectRoot);
		if (!rebased) {
			return null;
		}
		return { source: rebased, line: inlinePos.line, column: inlinePos.column ?? 0 };
	}

	sourceToGenerated(absPath: string, line: number, column: number): GeneratedLocation[] {
		const candidates = this.scriptsBySource.get(absPath);
		if (!candidates) {
			return [];
		}
		const results: GeneratedLocation[] = [];
		for (const script of candidates) {
			const entry = script.sourceNameByAbsPath.get(absPath);
			if (!entry) {
				continue;
			}
			if (entry.stage === 'alloy') {
				// Reverse alloy chain lands with the forward chain in a follow-up.
				continue;
			}
			const pos = script.inline.consumer.generatedPositionFor({ source: entry.rawName, line, column });
			if (pos.line === null) {
				continue;
			}
			results.push({ url: script.v8url, line: pos.line, column: pos.column ?? 0 });
		}
		return results;
	}

	dispose(): void {
		for (const script of this.scripts.values()) {
			script.inline.consumer.destroy();
			script.alloy?.consumer.destroy();
		}
		this.scripts.clear();
		this.scriptsBySource.clear();
	}
}

async function loadMapEntry(raw: RawSourceMap): Promise<MapEntry> {
	const consumer = await new SourceMapConsumer(raw);
	return {
		consumer,
		sourceRoot: raw.sourceRoot,
		rawSources: raw.sources.slice(),
	};
}

async function tryReadRawMap(p: string): Promise<RawSourceMap | null> {
	try {
		const text = await fs.readFile(p, 'utf8');
		return JSON.parse(text) as RawSourceMap;
	} catch {
		return null;
	}
}

async function walkJs(dir: string): Promise<string[]> {
	const results: string[] = [];
	const stack = [ dir ];
	while (stack.length > 0) {
		const current = stack.pop() as string;
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
			} else if (entry.isFile() && full.endsWith('.js')) {
				results.push(full);
			}
		}
	}
	return results;
}
