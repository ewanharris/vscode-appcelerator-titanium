import { strict as assert } from 'assert';
import * as path from 'path';
import { detectProjectType } from '../../../debugger/next/sourceMaps/projectType';
import { SourceMapResolver } from '../../../debugger/next/sourceMaps/sourceMapResolver';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../../src/test/common/fixtures/debugger-next');
const CLASSIC_FIXTURE = path.join(FIXTURES_ROOT, 'classic');
const ALLOY_FIXTURE = path.join(FIXTURES_ROOT, 'alloy');

describe('detectProjectType', () => {
	it('returns "classic" when no app/alloy.js is present', async () => {
		const type = await detectProjectType(CLASSIC_FIXTURE);
		assert.equal(type, 'classic');
	});

	it('returns "alloy" when app/alloy.js is present', async () => {
		const type = await detectProjectType(ALLOY_FIXTURE);
		assert.equal(type, 'alloy');
	});
});

describe('SourceMapResolver / classic', () => {
	let resolver: SourceMapResolver;

	beforeEach(async () => {
		resolver = new SourceMapResolver();
		await resolver.init(CLASSIC_FIXTURE, 'android');
	});

	afterEach(() => {
		resolver.dispose();
	});

	it('lists deployed scripts as /-rooted V8 URLs', () => {
		const urls = resolver.listScripts().map(s => s.v8url).sort();
		assert.deepEqual(urls, [ '/app.js', '/lib/helper.js', '/utils.js' ]);
	});

	it('exposes the deployed file path for each script', () => {
		const utils = resolver.listScripts().find(s => s.v8url === '/utils.js');
		assert.ok(utils);
		assert.ok(utils.generatedFile.endsWith(path.join('build', 'android', 'assets', 'utils.js')),
			`unexpected generatedFile: ${utils.generatedFile}`);
	});

	it('resolves /utils.js to the Android override source', () => {
		const loc = resolver.generatedToSource('/utils.js', 1, 0);
		assert.ok(loc, 'expected a SourceLocation, got null');
		assert.ok(loc.source.endsWith(path.join('Resources', 'android', 'utils.js')),
			`expected override path; got ${loc.source}`);
		assert.ok(loc.source.startsWith(CLASSIC_FIXTURE),
			`expected source rebased under fixture; got ${loc.source}`);
	});

	it('resolves a subfolder script to its source', () => {
		const loc = resolver.generatedToSource('/lib/helper.js', 1, 0);
		assert.ok(loc);
		assert.ok(loc.source.endsWith(path.join('Resources', 'lib', 'helper.js')),
			`unexpected source: ${loc.source}`);
	});

	it('resolves /app.js to Resources/app.js', () => {
		// app.js opens with a 4-line JSDoc block; first mapped position is line 5
		// (the const tabGroup declaration). Lines before that have no mapping.
		const loc = resolver.generatedToSource('/app.js', 5, 0);
		assert.ok(loc);
		assert.ok(loc.source.endsWith(path.join('Resources', 'app.js')),
			`unexpected source: ${loc.source}`);
	});

	it('returns null for an unknown V8 URL', () => {
		assert.equal(resolver.generatedToSource('/does/not/exist.js', 1, 0), null);
	});

	it('lists override source path in userSources', () => {
		const utils = resolver.listScripts().find(s => s.v8url === '/utils.js');
		assert.ok(utils);
		const hasOverride = utils.userSources.some(s => s.endsWith(path.join('Resources', 'android', 'utils.js')));
		assert.ok(hasOverride, `userSources missing override; got ${utils.userSources.join(', ')}`);
	});

	it('maps user source path back to its V8 URL', () => {
		const sourcePath = path.join(CLASSIC_FIXTURE, 'Resources', 'android', 'utils.js');
		const generated = resolver.sourceToGenerated(sourcePath, 1, 0);
		assert.ok(generated.length > 0, 'expected at least one GeneratedLocation');
		assert.equal(generated[0].url, '/utils.js');
	});

	it('returns empty array for a source path the resolver does not know', () => {
		const generated = resolver.sourceToGenerated('/totally/unknown/path.js', 1, 0);
		assert.deepEqual(generated, []);
	});
});
