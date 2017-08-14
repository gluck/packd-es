const path = require( 'path' );
const sander = require( 'sander' );

exports.root = path.resolve( __dirname );
exports.tmpdir = process.env.NOW ? `/tmp` : `${exports.root}/.tmp`;
exports.registry = `http://registry.npmjs.org`;

if ( !process.env.NOW ) {
	try {
		sander.rimrafSync( exports.tmpdir );
		sander.mkdirSync( exports.tmpdir );
	} catch ( err ) {
		// already exists
	}
}

exports.npmInstallEnvVars = [];
exports.debugEndpoints = true;

exports.additionalBundleResHeaders = {
	'Cache-Control': 'max-age=86400',
};

// if (process.env.AWS) {
if (true) {
	const cacheExpiration = 60 * 60 * 24 * 365
	exports.npmInstallEnvVars = ["npm_config_cache=~/.npm"];
	exports.debugEndpoints = false;
	exports.additionalBundleResHeaders = {
		'Cache-Control': 'public, max-age=' + cacheExpiration,
		'X-Content-Type-Options': 'nosniff',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Request-Method': 'GET',
		'X-Powered-By': 'https://github.com/rich-Harris/packd',
		'Strict-Transport-Security': `max-age=${cacheExpiration}; includeSubDomains; preload`,
	};
}

