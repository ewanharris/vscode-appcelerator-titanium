import * as path from 'path';

const SEGMENT_RE = /(?:^|\/)(app\/|Resources\/)/;

export function rebaseSourcePath(rawSource: string, sourceRoot: string | undefined, projectRoot: string): string | null {
	const combined = sourceRoot && sourceRoot.length > 0
		? path.posix.join(sourceRoot, rawSource)
		: rawSource;
	const match = SEGMENT_RE.exec(combined);
	if (!match) {
		return null;
	}
	const sliceStart = match.index === 0 ? 0 : match.index + 1;
	const tail = combined.slice(sliceStart);
	return path.join(projectRoot, ...tail.split('/'));
}
