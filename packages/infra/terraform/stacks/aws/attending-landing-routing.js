function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : '';
  var uri = request.uri || '/';

  if (host !== 'attending.hashpass.tech') return request;

  if (
    uri === '/' ||
    uri === '/index.html' ||
    uri === '/attending' ||
    uri === '/attending/' ||
    uri === '/attending/index.html'
  ) {
    request.uri = '/attending/index.html';
  }

  return request;
}
