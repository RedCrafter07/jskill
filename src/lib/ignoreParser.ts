import { readdir, readFile } from 'fs/promises';
import path from 'path';
import unique from './util/unique';

export interface file {
	path: string;
	type: 'file' | 'dir';
}

export default async function ignoreParser(input: string) {
	const lines = input
		.split('\n')
		.map((line) => line.trim().split('#')[0].trim())
		.filter((line) => line.length > 0);

	const ignored: file[] = [];

	unique(lines).forEach((l) => {
		ignored.push({
			path: l,
			type: l.endsWith('/') ? 'dir' : 'file',
		});
	});

	return ignored;
}

(async () => {
	await ignoreParser(await readFile('./src/config/.jskillignore', 'utf-8'));
})();
