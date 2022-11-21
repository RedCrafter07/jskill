#!/usr/bin/env node

import { Command, Option } from 'commander';
import path from 'path';
import { version } from '../../package.json';
import { createSpinner } from 'nanospinner';
import { copyFile } from 'fs/promises';
import { existsSync } from 'fs';

const program = new Command('jskill');

export const cwd = process.cwd();
export const mainDir = path.join(__dirname, '..', '..');
export const configDir = path.join(mainDir, 'src', 'config');

program.version(version, '-v, --version');

program
	.command('init')
	.description('Add config files to your project')
	.addOption(
		new Option(
			'--no-pull',
			'Prevent pulling the latest version of the config files',
		).default(true),
	)
	.action(async (options) => {
		const { pull } = options;

		const s = createSpinner('Pulling config files...').start();

		if (pull) {
			s.warn({ text: 'Pulling is not yet implemented' });
		}

		s.update({ text: 'Copying config files...' });

		if (await existsSync(path.join(cwd, '.jskillignore'))) {
			s.error({ text: 'Config files already exist' });
			return;
		}

		await copyFile(configDir + '/.jskillignore', cwd + '/.jskillignore');

		s.success({ text: 'Config files copied' });

		process.exit(0);
	});

program.action(() => {
	console.log('Hi');
});

program.parse(process.argv);
