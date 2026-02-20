const http = require('http');

http.createServer((req, res) => {
  console.log('Incoming request:', req.url);
  res.writeHead(200);
  res.end('OK');
}).listen(8081, () => {
  console.log('Test server running on port 8081');
});
