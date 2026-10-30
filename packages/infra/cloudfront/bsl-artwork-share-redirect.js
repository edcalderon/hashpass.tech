// Viewer-request function for the bsl.hashpass.tech / bsl-dev.hashpass.tech
// distributions. Public attending artwork pages and their images are served by
// the HashPass Links API, not the static BSL export, so social crawlers and
// visitors for /attending/bsl/a/<token>[/image] are redirected there. Every
// other request passes through untouched (the BSL app is a client-routed SPA).
function handler(event) {
  var request = event.request;
  var host = request.headers && request.headers.host ? request.headers.host.value.toLowerCase() : '';
  var match = (request.uri || '').match(/^\/attending\/bsl\/a\/([A-Za-z0-9_-]{40,64})(\/image)?\/?$/);

  if (!match || (host !== 'bsl.hashpass.tech' && host !== 'bsl-dev.hashpass.tech')) return request;

  var origin = host === 'bsl-dev.hashpass.tech' ? 'https://dev.hashpass.link' : 'https://hpass.id';
  return {
    statusCode: 302,
    statusDescription: 'Found',
    headers: {
      location: { value: origin + '/a/' + match[1] + (match[2] ? '/image' : '') },
      'cache-control': { value: 'no-store' },
    },
  };
}
