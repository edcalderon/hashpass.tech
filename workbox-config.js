const packageJson = require('./package.json');
const version = packageJson.version;

module.exports = {
	globDirectory: 'dist/',
	globPatterns: [
		'**/*.{css,js,svg,ico,json}'
	],
	globIgnores: [
		'**/*.html',
		'**/sw.js' // Don't cache the service worker itself
	],
	swDest: 'dist/sw.js',
	maximumFileSizeToCacheInBytes: 2 * 1024 * 1024, // 2MB - reduced to prevent memory issues
	ignoreURLParametersMatching: [
		/^utm_/,
		/^fbclid$/
	],
	// Version-based cache naming
	cacheId: `hashpass-v${version}`,
	runtimeCaching: [
		{
			urlPattern: /\.html$/,
			handler: 'NetworkFirst',
			options: {
				cacheName: `html-cache-v${version}`,
				networkTimeoutSeconds: 3,
				cacheableResponse: {
					statuses: [0, 200]
				},
				// Limit cache entries to prevent memory bloat
				plugins: [
					{
						cacheKeyWillBeUsed: async ({ request }) => {
							return request.url;
						},
						cacheWillUpdate: async ({ response }) => {
							return response && response.status === 200 ? response : null;
						}
					}
				]
			}
		},
		{
			urlPattern: /\/config\/versions\.json$/,
			handler: 'NetworkFirst',
			options: {
				cacheName: `version-cache-v${version}`,
				networkTimeoutSeconds: 1,
				cacheableResponse: {
					statuses: [0, 200]
				},
				// Don't cache version checks - always fetch fresh
				plugins: [
					{
						cacheWillUpdate: async () => {
							// Never cache version checks
							return null;
						}
					}
				]
			}
		}
	]
};