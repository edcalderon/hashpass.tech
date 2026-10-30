function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : '';
  var uri = request.uri || '/';
  var eventHosts = {
    bsl: true,
    'bsl-on-tour': true,
    bsl2025: true,
    chile2026: true,
    colombia2026: true,
    cbweek: true,
    cbweek2026: true,
    'hash-poker': true,
    peru2026: true,
  };
  var suffix = '.hashpass.tech';

  if (host === 'attending.hashpass.tech' && (uri === '/' || uri === '/index.html')) {
    request.uri = '/attending/index.html';
    return request;
  }

  if (host.slice(-suffix.length) !== suffix) return request;

  var eventSlug = host.slice(0, -suffix.length);
  if (eventSlug.indexOf('.') !== -1 || eventHosts[eventSlug] !== true) return request;

  var artworkShare = uri.match(/^\/attending\/([a-z0-9][a-z0-9-]{0,79})\/a\/([A-Za-z0-9_-]{40,64})(\/image)?\/?$/i);
  if (artworkShare && artworkShare[1].toLowerCase() === eventSlug) {
    var apiPath = artworkShare[3] ? '/a/' + artworkShare[2] + '/image' : '/a/' + artworkShare[2];
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: {
        location: { value: 'https://hpass.id' + apiPath },
        'cache-control': { value: 'no-store' },
      },
    };
  }

  if (uri === '/' || uri === '/index.html') {
    request.uri = '/attending/' + eventSlug + '/index.html';
    return request;
  }

  var eventRoute = uri.match(/^\/attending\/([a-z0-9][a-z0-9-]{0,79})\/?$/i);
  if (eventRoute && eventRoute[1].toLowerCase() === eventSlug) {
    request.uri = '/attending/' + eventSlug + '/index.html';
  }

  return request;
}
