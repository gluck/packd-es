const path = require('path');
const sander = require('sander');

exports.root = path.resolve(__dirname);
exports.tmpdir = '/tmp';
exports.registry = 'https://registry.npmjs.org';

try {
	sander.rimrafSync(exports.tmpdir);
	sander.mkdirSync(exports.tmpdir);
} catch (err) {
	// already exists
}
exports.npmInstallEnvVars = [];
exports.additionalBundleResHeaders = {
	'Cache-Control': 'max-age=86400',
};