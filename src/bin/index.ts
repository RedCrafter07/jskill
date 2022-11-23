#!/usr/bin/env node

import { Command, Option } from 'commander';
import path, { sep } from 'path';
import { version } from '../../package.json';
import { createSpinner, Spinner } from 'nanospinner';
import {
	copyFile,
	mkdir,
	readFile,
	writeFile,
	readdir,
	unlink,
	rm,
} from 'fs/promises';
import { existsSync } from 'fs';
import chalk from 'chalk';
import ignoreParser, { file } from '../lib/ignoreParser';
import gradient from 'gradient-string';
import { textSync } from 'figlet';
import { prompt } from 'inquirer';

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
	.addOption(
		new Option(
			'-c <path>, --config <path>',
			'Specify config file path',
		).default(
			path.join(cwd, '.jskillignore'),
			"The config file in the project's root directory",
		),
	)
	.action(async (options) => {
		const { ignoreConfig, disableCache } = options;

		console.log(
			gradient(
				'#ff3434',
				'#ffcc00',
				'#ff3434',
			)(
				await textSync('JSKILL', {
					font: 'Bloody',
					horizontalLayout: 'full',
				}),
			),
		);

		let config: file[] = [];

		if (ignoreConfig) console.log(chalk.red('[!] Not implemented yet!'));

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

		const configFiles = config
			.filter((f) => f.type == 'file')
			.map((f) => f.path);
		const configDirs = config
			.filter((f) => f.type == 'dir')
			.map((f) => f.path.slice(0, -1));

		if (configFiles.length > 0)
			console.log(
				chalk.greenBright(`[+] Ignored files: ${configFiles.join(', ')}`),
			);

		if (configDirs.length > 0)
			console.log(
				chalk.greenBright(`[+] Ignored directories: ${configDirs.join(', ')}`),
			);

		const s = await createSpinner('Scanning directories...', {
			frames: ['[=   ]', '[ =  ]', '[  = ]', '[   =]', '[  = ]', '[ =  ]'],
			interval: 100,
		}).start();

		const directories = await scanDir(cwd, config, s);

		s.update({ text: 'Scanning files...' });

		const files = await scanFiles(directories);

		s.update({ text: 'Indexing...' });

		if (!files.some((f) => f.endsWith('.ts'))) {
			s.error({ text: 'No TypeScript files found!', mark: '[!]' });
			console.log(
				chalk.red(
					"[!] You can't use jskill without TypeScript. You don't want to purge your whole project, do you?",
				),
			);
			process.exit(1);
		}

		const indexedFiles = files.filter((f) => f.endsWith('.js'));

		if (indexedFiles.length < 1) {
			s.error({
				text: chalk.red('No JavaScript files found!'),
				mark: chalk.red('[!]'),
			});
			console.log(
				chalk.red(
					'[!] You can only use jskill on projects that include JavaScript files.',
				),
			);
			console.log(chalk.red('[!] Exiting...'));
			process.exit(1);
		}

		s.update({ text: 'Creating file tree...' });

		const tree = await createTree(files);

		s.update({ text: 'Finishing...' });

		s.success({ text: 'Done!' });

		console.log(
			chalk.greenBright(
				`[+] Found ${indexedFiles.length} JavaScript files in ${directories.length} directories.`,
			),
		);
		console.log(
			chalk.yellow(
				`[/] Files in green are JavaScript files which can be selected.`,
			),
		);
		console.log(cwd);
		console.log(tree);

		const { toPurge }: { toPurge: string[] } = await prompt([
			{
				name: 'toPurge',
				type: 'checkbox',
				message: 'Select files to purge',
				choices: indexedFiles.map((f) => ({
					name: f,
					value: f,
					checked: true,
				})),
			},
		]);

		if (toPurge.length < 1) {
			console.log(chalk.yellowBright('[/] No files selected. Exiting...'));
			process.exit(0);
		}

		const remappedFiles = toPurge.map((f) => path.join(cwd, f));

		const { confirm }: { confirm: boolean } = await prompt([
			{
				name: 'confirm',
				type: 'confirm',
				message: `Are you sure you want to purge ${remappedFiles.length} files?`,
			},
		]);

		if (!confirm) {
			console.log(chalk.yellowBright('[/] Exiting...'));
			process.exit(0);
		}

		const purgeSpinner = await createSpinner('Purging files...', {
			frames: ['[=   ]', '[ =  ]', '[  = ]', '[   =]', '[  = ]', '[ =  ]'],
			interval: 100,
		}).start();

		await purgeFiles(remappedFiles, purgeSpinner);

		purgeSpinner.update({ text: 'Checking for empty directories...' });

		const emptyDirs = await checkEmptyDirs(directories);

		purgeSpinner.success({ text: 'Done!' });

		if (emptyDirs.length > 0) {
			console.log(
				chalk.green(`[+] Found empty directories: ${emptyDirs.join(', ')}`),
			);

			const { confirm: confirmEmptyDirs }: { confirm: boolean } = await prompt([
				{
					name: 'confirm',
					type: 'confirm',
					message: `Please confirm the deletion of the directories mentioned above.`,
				},
			]);

			if (!confirmEmptyDirs) {
				console.log(chalk.yellowBright('[/] Exiting...'));
				process.exit(0);
			}

			const emptyDirsSpinner = await createSpinner(
				'Deleting empty directories...',
				{
					frames: ['[=   ]', '[ =  ]', '[  = ]', '[   =]', '[  = ]', '[ =  ]'],
					interval: 100,
				},
			).start();

			await deleteDirs(emptyDirs);

			emptyDirsSpinner.success({ text: 'Done!' });
		}

		console.log(chalk.greenBright('[+] Done!'));

		console.log(
			chalk.greenBright(
				'Hope this tool helped you! :)\nIf so, consider starring the repo on GitHub!\nhttps://github.com/RedCrafter07/jskill',
			),
		);

		console.log('Have a nice day! :)');

		process.exit(0);
	});

program.parse(process.argv);

async function deleteDirs(dirs: string[]) {
	for (const dir of dirs) {
		let actualDir: string = dir;

		// check if the directory is empty and if the parent directory would be empty after deleting the folder
		const parts = dir.split(sep);

		if (parts.length > 1) {
			for (let i = parts.length - 1; i > 0; i--) {
				const parentDir = parts.slice(0, i).join(sep);

				if (
					(await (
						await readdir(parentDir, { withFileTypes: true })
					).filter((f) => f.isFile()).length) === 0
				)
					actualDir = parentDir;
				else break;
			}
		}

		await rm(actualDir, { recursive: true });
	}
}

async function checkEmptyDirs(dirs: string[]) {
	const emptyDirs: string[] = [];

	for (const dir of dirs) {
		const files = await readdir(dir);

		if (files.length < 1) emptyDirs.push(dir);
	}

	return emptyDirs;
}

async function purgeFiles(files: string[], spinner: Spinner) {
	const purgedFiles: string[] = [];

	for (const file of files) {
		try {
			await unlink(file);
			purgedFiles.push(file);
		} catch (e) {
			spinner.error({ text: `An error occurred while purging ${file}` });
			console.log(chalk.redBright(`[!] ${e}`));
		}
	}

	spinner.success({ text: 'Done!' });
}

async function createTree(files: string[]): Promise<string> {
	const char = '├──',
		altChar = '└──',
		indent = '└─',
		horizontalLine = '│  ';

	const tree: string[] = [];

	type fileMap = (string | [string, fileMap])[];

	const fileMap: fileMap = [];

	for (const file of files) {
		const path = file.split(sep);

		let map: fileMap = fileMap;

		for (const [i, p] of path.entries()) {
			if (i === path.length - 1) {
				map.push(p);
				break;
			}

			let found = false;

			for (const m of map) {
				if (typeof m === 'string') continue;

				if (m[0] === p) {
					map = m[1];
					found = true;
					break;
				}
			}

			if (!found) {
				const newMap: fileMap = [];
				map.push([p, newMap]);
				map = newMap;
			}
		}
	}

	const generateTree = (map: fileMap, newIndent: string = ''): void => {
		for (const [i, m] of map.entries()) {
			if (typeof m === 'string') {
				tree.push(
					`${newIndent}${i === map.length - 1 ? altChar : char} ${
						m.endsWith('.js') ? chalk.greenBright(m) : chalk.blueBright(m)
					}`,
				);
			} else {
				tree.push(
					`${newIndent}${i === map.length - 1 ? altChar : char} ${m[0]}`,
				);
				generateTree(
					m[1],
					`${newIndent}${i === map.length - 1 ? '   ' : horizontalLine}`,
				);
			}
		}
	};

	generateTree(fileMap);

	return tree.join(`\n`);
}

async function scanFiles(directories: string[]) {
	const files: string[] = [];

	for (const dir of directories) {
		const filesInDir = await (await readdir(dir, { withFileTypes: true }))
			.filter((f) => f.isFile())
			.map((f) => f.name);

		for (const file of filesInDir) {
			files.push(path.join(dir, file));
		}
	}

	return files;
}

async function scanDir(workDir: string, ignored: file[], spinner?: Spinner) {
	const ignoredDirs = ignored
		.filter((f) => f.type == 'dir')
		.map((f) => f.path.slice(0, -1));
	if (ignoredDirs.includes(workDir)) return [];

	const dirs = await (
		await readdir(workDir, { withFileTypes: true })
	).filter((f) => f.isDirectory());

	const directories: string[] = [];

	for (const dir of dirs) {
		if (!ignoredDirs.includes(dir.name)) {
			directories.push(dir.name);

			if (spinner)
				spinner.update({ text: `Scanning directory ${dir.name}...` });

			const subDirs = await scanDir(
				path.join(workDir, dir.name),
				ignored,
				spinner,
			);

			directories.push(...subDirs.map((d) => path.join(dir.name, d)));
		}
	}

	return directories;
}

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
				await readFile(path.join(cacheDir, '.jskillignore.json'), 'utf8'),
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
