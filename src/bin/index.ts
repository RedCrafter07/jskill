#!/usr/bin/env node

import { Argument, Command, Option } from 'commander';
import path from 'path';
import { version } from '../../package.json';

const program = new Command('jskill');

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
	.action((options) => {
		console.log('init', options);

		const mainDir = path.join(__dirname, '..', '..');
		console.log(mainDir);
	});

program.action(() => {
	console.log('Hi');
});

program.parse(process.argv);
