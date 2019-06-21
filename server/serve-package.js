const { fork } = require('child_process');
const semver = require('semver');
const zlib = require('zlib');
const get = require('./utils/get.js');
const findVersion = require('./utils/findVersion.js');
const logger = require('./logger.js');
const cache = require('./cache.js');
const etag = require('etag');
const sha1 = require('sha1');

const { sendBadRequest, sendError } = require('./utils/responses.js');
const { registry, additionalBundleResHeaders } = require('../config.js');

module.exports = async function servePackage(req, res, next) {
	if (req.method !== 'GET') return next();
	const packages = [];
	let redirect = false;
	for (const it of req.url.slice(1).split(',')) {
		const match = /^(?:@([^/]+)\/)?([^@/]+)(?:@(.+?))?(?:\/(.+?))?$/.exec(it);
		if (!match) {
			return sendBadRequest(res, 'invalid request');
		}
		const user = match[1];
		const id = match[2];
		let tag = match[3];
		const deep = match[4];
		let qualified = user ? `@${user}/${id}` : id;
	
		const result = await get(`${registry}/${encodeURIComponent(qualified).replace('%40', '@')}`);
		const meta = JSON.parse(result);
		if (!meta.versions) {
			logger.error(`[${qualified}] invalid module`);

			return sendBadRequest(res, 'invalid module');
		}
		const version = findVersion(meta, tag);
		if (!semver.valid(version)) {
			logger.error(`[${qualified}] invalid tag`);

			return sendBadRequest(res, 'invalid tag');
		}
		if (version !== tag) {
			tag = version;
			redirect = true;
		}
		if (qualified !== meta.name) {
			qualified = meta.name;
			redirect = true;
		}
		packages.push({
			qualified, version, deep, meta, url: `${qualified}@${version}${deep ? `/${deep}` : ''}`
		});
	}
	if (redirect) {
		const url = '/' + packages.map(it => it.url).join(',');
		logger.info(`Redirecting to ${url}`);
		res.redirect(302, url);
		return;
	}
	packages.name = packages.map(it => `${it.qualified}${it.deep ? `/${it.deep}`: ''}`).join(',');

	return fetchBundle(packages).then(zipped => {
		logger.info(`[${packages.name}] serving ${zipped.length} bytes`);
		res.status(200);
		res.set(
			Object.assign(
				{
					'Content-Length': zipped.length,
					'Content-Type': 'application/javascript; charset=utf-8',
					'Content-Encoding': 'gzip'
				},
				additionalBundleResHeaders
			)
		);
		// FIXME(sven): calculate the etag based on the original content
		res.setHeader('ETag', etag(zipped));
		res.end(zipped);
	}).catch(err => {
		logger.error(`[${req.url}] ${err.message}`, err.stack);
		sendError(res, err.message);
	});
};

const inProgress = {};

function fetchBundle(packages) {
	const hash = sha1(packages.map(it => it.url).join('#'));
	if (cache.has(hash)) {
		logger.info(`[${packages.name}] is cached`);
		return Promise.resolve(cache.get(hash));
	}
	if (inProgress[hash]) {
		logger.info(`[${packages.name}] request was already in progress`);
	} else {
		logger.info(`[${packages.name}] is not cached`);

		inProgress[hash] = createBundle(hash, packages)
			.then(
				result => {
					const zipped = zlib.gzipSync(result);
					cache.set(hash, zipped);
					return zipped;
				},
				err => {
					inProgress[hash] = null;
					throw err;
				}
			)
			.then(zipped => {
				inProgress[hash] = null;
				return zipped;
			});
	}
	return inProgress[hash];
}

function createBundle(hash, packages) {
	return new Promise((fulfil, reject) => {
		const child = fork('server/child-processes/create-bundle.js');
		child.on('message', message => {
			if (message === 'ready') {
				child.send({
					type: 'start',
					params: { hash, name: packages.name, packages }
				});
			}

			if (message.type === 'info') {
				logger.info(message.message);
			} else if (message.type === 'error') {
				const error = new Error(message.message);
				error.stack = message.stack;

				reject(error);
				child.kill();
			} else if (message.type === 'result') {
				fulfil(message.code);
				child.kill();
			}
		});
	});
}
