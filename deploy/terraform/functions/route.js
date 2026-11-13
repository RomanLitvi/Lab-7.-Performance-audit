// Viewer request: pick the build by Host and fall back to index.html for SPA paths.
function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';
  var version = host.indexOf('slow.') === 0 ? 'slow' : 'fast';
  var uri = request.uri;

  if (uri.lastIndexOf('.') <= uri.lastIndexOf('/')) {
    uri = '/index.html';
  }

  request.uri = '/' + version + uri;
  return request;
}
