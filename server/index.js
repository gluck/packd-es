const express = require('express');
const compression = require('compression');
const prettyBytes = require('pretty-bytes');
const padRight = require('./utils/padRight.js');
const servePackage = require('./serve-package.js');
const logger = require('./logger.js');
const cache = require('./cache.js');
const cors = require('cors')

const app = express();
const port = process.env.PORT || 9000;
const whitelist = [
	'https://stg-webcomponents-editor.firebaseapp.com',
	'https://prd-webcomponents-editor.firebaseapp.com'
]

if (process.env.NODE_ENV === 'production') {
	const corsOptions = {
		origin: (origin, callback) => {
			if (whitelist.indexOf(origin) !== -1) {
				callback(null, true)
			} else {
				callback(new Error('Not allowed by CORS'))
			}
		}
	}
	app.use(cors(corsOptions))
} else {
	app.use(cors())
}

app.use(compression());
app.get('/favicon.ico', (req, res) => res.status(204));
app.get('/_cache', (req, res) => {
	res.status(200);
	res.set({
		'Content-Type': 'text/plain'
	});
	res.write(`Total cached bundles: ${prettyBytes(cache.length)}\n`);
	const table = [];
	let maxKey = 7; // 'package'.length
	let maxSize = 4; // 'size'.length
	cache.forEach((value, pkg) => {
		const size = value.length;
		const sizeLabel = prettyBytes(size);

		table.push({ pkg, size, sizeLabel });

		maxKey = Math.max(maxKey, pkg.length);
		maxSize = Math.max(maxSize, sizeLabel.length);
	});
	if (req.query.sort === 'size') {
		table.sort((a, b) => b.size - a.size);
	}
	const separator = padRight('', maxKey + maxSize + 5, '─');
	res.write(`┌${separator}┐\n`);
	res.write(
		`│ ${padRight('package', maxKey)} │ ${padRight('size', maxSize)} │\n`
	);
	res.write(`├${separator}┤\n`);
	table.forEach(row => {
		res.write(
			`│ ${padRight(row.pkg, maxKey)} │ ${padRight(
				row.sizeLabel,
				maxSize
			)} │\n`
		);
	});
	res.write(`└${separator}┘\n`);
	res.end();
});
// log requests and CORS allow
app.use((req, res, next) => {
	const remoteAddr = (function () {
		if (req.ip) return req.ip;
		const sock = req.socket;
		if (sock.socket) return sock.socket.remoteAddress;
		if (sock.remoteAddress) return sock.remoteAddress;
		return ' - ';
	})();
	const date = new Date().toUTCString();
	const url = req.originalUrl || req.url;
	const httpVersion = req.httpVersionMajor + '.' + req.httpVersionMinor;
	logger.info(
		`${remoteAddr} - - [${date}] "${req.method} ${url} HTTP/${httpVersion}"`
	);
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});
app.use(servePackage);
app.listen(port, () => {
	logger.log(`started at ${new Date().toUTCString()}`);
	console.log('listening on localhost:' + port);
	if (process.send) process.send('start');
});
