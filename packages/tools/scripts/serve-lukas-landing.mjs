#!/usr/bin/env node
import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

const [directoryArg, portArg] = process.argv.slice(2);
if (!directoryArg || !portArg) {
  console.error('Usage: serve-lukas-landing.mjs <directory> <port>');
  process.exit(1);
}

const root = path.resolve(directoryArg);
const port = Number(portArg);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const routeToFile = (requestPath) => {
  const decoded = decodeURIComponent(requestPath.split('?', 1)[0]);
  if (decoded === '/' || decoded === '/lukas') return '/lukas.html';
  if (decoded === '/index') return '/index.html';
  return decoded;
};

const server = http.createServer(async (request, response) => {
  try {
    const relativePath = routeToFile(request.url || '/');
    const filePath = path.resolve(root, `.${relativePath}`);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(400);
      response.end('Invalid path');
      return;
    }
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': stat.size,
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Lukas landing dev server: http://127.0.0.1:${port}/lukas`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
