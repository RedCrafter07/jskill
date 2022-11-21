#!/usr/bin/env node

import { Command, Option } from 'commander';
import path from 'path';
import { version } from '../../package.json';
import { createSpinner } from 'nanospinner';
import { copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import chalk from 'chalk';

const program = new Command('jskill');

export const cwd = process.cwd();
export const mainDir = path.join(__dirname, '..', '..');
export const configDir = path.join(mainDir, 'src', 'config');

program.version(version, '-v, --version');

program
	.command('init')
	.aliases(['initialize'])
	.description('Add config files to your project')
	.addOption(
		new Option(
			'--no-pull',
			'Prevent pulling the latest version of the config files',
		).default(true),
	)
	.addOption(
		new Option('-f, --force', 'Overwrite existing config files').default(false),
	)
	.action(async (options) => {
		const { pull, force } = options;

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

program
	.addOption(
		new Option(
			'-i, --ignore-config',
			'Ignore config files and use default values.',
		).default(false),
	)
	.addOption(new Option('--disable-cache', 'Cache config files').default(false))
	.action((options) => {
		const { ignoreConfig, disableCache } = options;

		const cache = !disableCache;

		console.log(options, cache);

		if (ignoreConfig)
			console.log(chalk.yellowBright('[!] Ignoring config files.'));
	});

program.parse(process.argv);
