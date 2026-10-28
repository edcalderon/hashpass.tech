#!/usr/bin/env node

import { createReadStream, watch as watchDirectory } from 'node:fs';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const [buildRootArg, portArg] = process.argv.slice(2);
if (!buildRootArg || !portArg) {
  console.error('Usage: dev-lukas-landing.mjs <build-root> <port>');
  process.exit(1);
}

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const buildRoot = path.resolve(buildRootArg);
const buildScript = path.join(repoRoot, 'packages/infra/terraform/stacks/hashpass-lukas-site/build.py');
const stackRoot = path.join(repoRoot, 'packages/infra/terraform/stacks/hashpass-lukas-site');
const watchRoots = [
  path.join(stackRoot, 'overrides'),
  path.join(repoRoot, 'packages/ui/src/system'),
];
const watchFiles = [buildScript];
const port = Number(portArg);
const landingUrl = `http://127.0.0.1:${port}/lukas`;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.vtt': 'text/vtt; charset=utf-8',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

let currentBuild = null;
let buildProcess = null;
let buildCounter = 0;
let queuedBuild = false;
let rebuildTimer = null;
let stopping = false;
const liveReloadClients = new Set();
const watchers = new Map();

const log = (message) => console.log(`[lukas] ${message}`);

const openBrowser = (url) => {
  const browserSetting = String(process.env.BROWSER || '').trim().toLowerCase();
  const disabled = ['0', 'false', 'no', 'none'].includes(String(process.env.LUKAS_AUTO_OPEN_BROWSER || '').toLowerCase())
    || ['0', 'false', 'no', 'none'].includes(browserSetting);
  const ci = ['1', 'true'].includes(String(process.env.CI || '').toLowerCase());
  if (disabled || ci) return;

  const command = process.env.BROWSER || (process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd.exe' : 'xdg-open');
  const args = process.platform === 'win32' && !process.env.BROWSER ? ['/d', '/c', 'start', '', url] : [url];
  const browser = spawn(command, args, { detached: true, stdio: 'ignore' });
  browser.on('error', (error) => log(`Could not open the browser automatically: ${error.message}`));
  browser.unref();
};

const routeToFile = (requestPath) => {
  const rawPath = requestPath.split('?', 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/')) return null;
  const normalized = path.posix.normalize(decoded);
  if (normalized.includes('\\')) return null;
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return null;
  if (normalized === '/' || normalized === '/lukas' || normalized === '/lukas/' || normalized === '/lks' || normalized === '/lks/') return '/lukas.html';
  if (normalized === '/index') return '/index.html';
  return normalized;
};

const notifyReload = () => {
  const payload = `data: ${JSON.stringify({ build: Date.now() })}\n\n`;
  for (const client of liveReloadClients) {
    try {
      client.write(payload);
    } catch {
      liveReloadClients.delete(client);
    }
  }
};

const runBuild = (reason) => new Promise((resolve) => {
  const output = path.join(buildRoot, `site-${Date.now()}-${buildCounter += 1}`);
  log(`Rebuilding Lukas landing (${reason})...`);
  const child = spawn('python3', [buildScript, output], {
    cwd: repoRoot,
    env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1', LUKAS_EXPORT_MAX_WORKERS: process.env.LUKAS_EXPORT_MAX_WORKERS || '2' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  buildProcess = child;
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.on('error', (error) => {
    log(`Lukas rebuild failed to start: ${error.message}`);
    buildProcess = null;
    resolve(false);
  });
  child.on('close', async (code, signal) => {
    buildProcess = null;
    if (code !== 0 || signal) {
      await fs.rm(output, { recursive: true, force: true });
      log(`Lukas rebuild failed${signal ? ` (${signal})` : ` with exit code ${code}`}.`);
      resolve(false);
      return;
    }
    const previousBuild = currentBuild;
    currentBuild = output;
    if (previousBuild) await fs.rm(previousBuild, { recursive: true, force: true });
    log('Lukas landing rebuilt; refreshing connected browsers.');
    notifyReload();
    resolve(true);
  });
});

const initialBuildWithRetries = async () => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await runBuild(attempt === 1 ? 'initial start' : `initial retry ${attempt - 1}`)) return true;
    if (attempt < 3 && !stopping) {
      log('Initial Lukas export did not complete; retrying in 2 seconds.');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return false;
};

const requestBuild = (reason) => {
  if (stopping) return;
  if (buildProcess) {
    queuedBuild = true;
    return;
  }
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    rebuildTimer = null;
    await runBuild(reason);
    if (queuedBuild && !stopping) {
      queuedBuild = false;
      requestBuild('queued file changes');
    }
  }, 250);
};

const refreshWatchers = async () => {
  const watchTree = async (directory) => {
    if (watchers.has(directory)) return;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    const watcher = watchDirectory(directory, (eventType, filename) => {
      requestBuild(`${eventType}${filename ? `: ${filename}` : ''}`);
      if (eventType === 'rename') void refreshWatchers();
    });
    watcher.on('error', () => watchers.delete(directory));
    watchers.set(directory, watcher);
    await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => watchTree(path.join(directory, entry.name))));
  };

  const fileWatchers = watchFiles.map(async (file) => {
    if (watchers.has(file)) return;
    try {
      await fs.stat(file);
      const watcher = watchDirectory(file, (eventType) => requestBuild(`${eventType}: ${path.basename(file)}`));
      watcher.on('error', () => watchers.delete(file));
      watchers.set(file, watcher);
    } catch {
      // The build script is part of the repository, but a missing optional
      // watch target should never prevent the landing from starting.
    }
  });
  await Promise.all([...watchRoots.map((root) => watchTree(root)), ...fileWatchers]);
};

const server = createServer(async (request, response) => {
  if ((request.url || '').split('?', 1)[0] === '/__lukas_live_reload') {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
    });
    response.write('retry: 1000\n\n');
    liveReloadClients.add(response);
    request.on('close', () => liveReloadClients.delete(response));
    return;
  }

  if (!currentBuild) {
    response.writeHead(503, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Lukas landing is building. Refresh shortly.');
    return;
  }

  try {
    const relativePath = routeToFile(request.url || '/');
    if (!relativePath) {
      response.writeHead(400);
      response.end('Invalid path');
      return;
    }
    const filePath = path.resolve(currentBuild, `.${relativePath}`);
    if (filePath !== currentBuild && !filePath.startsWith(`${currentBuild}${path.sep}`)) {
      response.writeHead(400);
      response.end('Invalid path');
      return;
    }
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    const extension = path.extname(filePath);
    if (extension === '.html' && request.method !== 'HEAD') {
      const html = await fs.readFile(filePath, 'utf8');
      const liveReloadScript = '<script>new EventSource("/__lukas_live_reload").onmessage=()=>location.reload();</script>';
      const body = html.replace('</body>', `${liveReloadScript}</body>`);
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': contentTypes[extension] });
      response.end(body);
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': stat.size,
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

const close = async () => {
  if (stopping) return;
  stopping = true;
  if (rebuildTimer) clearTimeout(rebuildTimer);
  if (buildProcess) buildProcess.kill('SIGTERM');
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear();
  for (const client of liveReloadClients) client.end();
  liveReloadClients.clear();
  await new Promise((resolve) => server.close(() => resolve()));
  process.exit(0);
};

process.on('SIGINT', close);
process.on('SIGTERM', close);

await fs.mkdir(buildRoot, { recursive: true });
const built = await initialBuildWithRetries();
if (!built) process.exit(1);
await refreshWatchers();
server.listen(port, '127.0.0.1', () => {
  log(`Live landing ready at ${landingUrl}`);
  log('Watching Lukas overrides and shared UI sources for changes.');
  openBrowser(landingUrl);
});
