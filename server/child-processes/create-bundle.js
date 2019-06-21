const path = require('path');
const sander = require('sander');
const child_process = require('child_process');
const rollup = require('rollup');
const resolve = require('rollup-plugin-node-resolve');
const Terser = require('terser');

const { npmInstallEnvVars, root, tmpdir } = require('../../config.js');

process.on('message', message => {
	if (message.type === 'start') {
		createBundle(message.params);
	}
});

process.send('ready');

async function createBundle({ hash, name, packages }) {
	packages.name = name;
	const dir = `${tmpdir}/${hash}`;
	const cwd = `${dir}/package`;

	try {
		await sander.mkdir(dir);
		await sander.writeFile(cwd, 'package.json', `
		{
			"name": "foo",
			"module": "index.js"
		}
		`);
		await sander.writeFile(cwd, 'index.js', 
			`${packages.map((it, i) => `import * as packd_export_${i} from '${it.qualified}${it.deep ? `/${it.deep}` : ''}';`).join('\n')}\nexport { ${packages.map((_, i) => `packd_export_${i}`).join(', ')} };`);
		await installDependencies(cwd, packages);

		const code = await bundleWithRollup(cwd, packages);

		info(`[${packages.name}] minifying`);

		const result = Terser.minify(code);

		if (result.error) {
			info(`[${packages.name}] minification failed: ${result.error.message}`);
		}

		process.send({
			type: 'result',
			code: result.error ? code : result.code
		});
	} catch (err) {
		process.send({
			type: 'error',
			message: err.message,
			stack: err.stack
		});
	}

	sander.rimraf(dir);
}

function installDependencies(cwd, packages) {
	const envVariables = npmInstallEnvVars.join(' ');
	const installCommand = `${envVariables} ${root}/node_modules/.bin/npm install --production ${packages.map(it => `${it.qualified}@${it.version}`).join(' ')}`;

	info(`[${packages.name}] running ${installCommand}`);

	return exec(installCommand, cwd, packages);
}

async function bundleWithRollup(cwd, packages) {
	const bundle = await rollup.rollup({
		input: path.resolve(cwd, 'index.js'),
		plugins: [
			resolve({ module: true, jsnext: true, main: false, modulesOnly: true }),
		]
	});

	const result = await bundle.generate({
		format: 'es'
	});

	if (result.output.length > 1) {
		info(`[${packages.name}] generated multiple chunks, trying Browserify instead`);
		throw new Error(`[${packages.name}] generated multiple chunks`);
	}

	info(`[${packages.name}] bundled using Rollup`);

	return result.output[0].code;
}

function exec(cmd, cwd, packages) {
	return new Promise((fulfil, reject) => {
		child_process.exec(cmd, { cwd }, (err, stdout, stderr) => {
			if (err) {
				return reject(err);
			}

			stdout.split('\n').forEach(line => {
				info(`[${packages.name}] ${line}`);
			});

			stderr.split('\n').forEach(line => {
				info(`[${packages.name}] ${line}`);
			});

			fulfil();
		});
	});
}

function info(message) {
	process.send({
		type: 'info',
		message
	});
}
