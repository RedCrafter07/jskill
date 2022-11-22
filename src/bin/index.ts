#!/usr/bin/env node

import { Command, Option } from 'commander';
import path from 'path';
import { version } from '../../package.json';
import { createSpinner } from 'nanospinner';
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync, fstat } from 'fs';
import chalk from 'chalk';
import ignoreParser, { file } from '../lib/ignoreParser';

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
	.action(async (options) => {
		const { ignoreConfig, disableCache } = options;

		let config: file[] = [];

		if (ignoreConfig)
			console.log(chalk.yellowBright('[/] Ignoring config files.'));

		if (disableCache) {
			console.log(chalk.yellowBright('[/] Disabled cache.'));
			console.log(
				chalk.yellowBright(
					'[!] A disabled cache will ignore the cached files and force-parse all jskill config files.',
				),
			);
		} else {
			const result = await cacheConfig('.jskillignore');

			if (result === false) {
				console.log(
					chalk.redBright('[!] An error occurred while caching. Exiting...'),
				);
				process.exit(1);
			}

			config = result;
		}
	});

program.parse(process.argv);

async function cacheConfig(filePath: string): Promise<file[] | false> {
	if (!(await existsSync(path.join(cwd, '.jskillignore')))) {
		console.log(chalk.redBright('[!] Config file does not exist.'));
		return false;
	}

	const cacheDir = path.join(mainDir, '.cache');

	const config = await readFile(path.join(cwd, '.jskillignore'), 'utf-8');

	if (!(await existsSync(cacheDir))) {
		console.log(chalk.yellow("[/] Cache directory doesn't exist."));
		console.log(chalk.green('[+] Creating cache directory...'));
		await mkdir(cacheDir);

		console.log(chalk.green('[+] Cache directory created.'));
	}

	console.log(chalk.yellow('[/] Checking config file existence...'));

	if (!(await existsSync(path.join(cacheDir, '.jskillignore')))) {
		console.log(chalk.green('[+] Copying config file...'));
		await copyFile(filePath, path.join(cacheDir, '.jskillignore'));
		console.log(chalk.green('[+] Config file copied.'));
	} else {
		console.log(chalk.yellow('[/] Config file already exist.'));
		console.log(chalk.yellow('[/] Comparing config file...'));

		const cachedConfig = await readFile(
			path.join(cacheDir, '.jskillignore'),
			'utf-8',
		);

		if (cachedConfig === config) {
			console.log(chalk.green('[+] Config files are the same.'));
			console.log(chalk.yellow('[/] Not parsing config file again.'));

			return JSON.parse(
				await readFile(path.join(cacheDir, '.jskillignore'), 'utf8'),
			);
		}

		console.log(chalk.yellow('[/] Config files are different.'));
		console.log(chalk.green('[+] Overriding old config file...'));

		await copyFile(filePath, path.join(cacheDir, '.jskillignore'));

		console.log(chalk.green('[+] Config file overridden.'));
	}

	console.log(chalk.yellow('[/] Parsing config file...'));

	const result = await ignoreParser(config);

	await writeFile(
		path.join(cacheDir, '.jskillignore.json'),
		JSON.stringify(result),
	);

	console.log(chalk.green('[+] Config file parsed.'));

	return result;
}
