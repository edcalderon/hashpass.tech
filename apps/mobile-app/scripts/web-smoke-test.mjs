#!/usr/bin/env node
// Serves the built web export (dist/client) locally and loads it in a real
// headless browser, failing if any route throws an uncaught JS error on
// initial render.
//
// This exists because of a real incident (v1.8.205): react-native-svg
// 15.11.2 built and typechecked fine, but its web bundle had a circular
// import that only threw "hasTouchableProperty is not a function" once
// Metro's minified output actually executed in a browser on any page
// rendering an SVG-based icon — a class of bug that no static check
// (typecheck, lint, unit tests) can catch, because the code is
// syntactically and structurally valid; it simply throws at runtime under
// the real bundler's module evaluation order. Only running the actual
// built bundle in a real JS engine catches this.
//
// Usage: node scripts/web-smoke-test.mjs [distDir]
// (defaults to dist relative to apps/mobile-app — the flattened static
// site layout that `npm run build:static`'s postbuild:static step
// produces, matching the actual production static host structure)

import { chromium } from 'playwright';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', process.argv[2] || 'dist');
const PORT = Number(process.env.SMOKE_TEST_PORT) || 4173;

// Routes chosen to cover: the public landing page (first thing every user
// hits), and the dashboard (where the v1.8.205 incident actually fired,
// because it's Icon/SVG-heavy and wrapped in CopilotStep).
const ROUTES = ['/', '/home', '/dashboard/explore'];

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Resolves a request path against distDir and rejects anything that would
// escape it (e.g. `../../etc/passwd`). This server only ever needs to serve
// this script's own hardcoded ROUTES, but CodeQL correctly flags req.url as
// user-controlled input regardless of that — path.join doesn't strip `..`
// segments, so an unvalidated join is a real traversal primitive even in a
// short-lived local/CI-only server.
const distDirResolved = path.resolve(distDir);

function resolveSafePath(candidatePath) {
  const resolved = path.resolve(candidatePath);
  if (resolved !== distDirResolved && !resolved.startsWith(distDirResolved + path.sep)) {
    return null;
  }
  return resolved;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = resolveSafePath(path.join(distDir, reqPath));

      if (!filePath) {
        res.writeHead(400);
        res.end('Bad request');
        return;
      }

      // Expo Router's static export pre-renders one HTML shell per route
      // (as either <route>.html or <route>/index.html depending on build
      // config), but the client bundle re-hydrates and handles routing
      // itself once it boots — so for a smoke test it's enough to always
      // fall back to the root index.html for any non-asset path, exactly
      // like a real static host's SPA fallback would.
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        const candidates = [
          resolveSafePath(`${filePath}.html`),
          resolveSafePath(path.join(filePath, 'index.html')),
          resolveSafePath(path.join(distDir, 'index.html')),
        ].filter(Boolean);
        filePath = candidates.find(existsSync) ?? candidates[candidates.length - 1];
      }

      if (!filePath || !existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
    });

    server.listen(PORT, () => resolve(server));
    server.on('error', reject);
  });
}

// This exact incident (v1.8.205) was caught by AppErrorBoundary's
// componentDidCatch, which renders a "HASHPASS hit a startup error"
// fallback UI and logs via console.error('💥 Uncaught render error:', ...)
// instead of re-throwing. React error boundaries swallow the exception
// inside React's own reconciliation, so it does NOT surface as a
// window-level `pageerror` event — checking only for pageerror would have
// missed this exact bug. The DOM fallback text is the most reliable signal;
// the console prefix and pageerror are kept as backup signals for anything
// that manages to escape the boundary entirely (e.g. errors during the
// boundary's own render, or thrown outside React's render cycle).
const ERROR_BOUNDARY_TEXT = 'HASHPASS hit a startup error';
const ERROR_BOUNDARY_CONSOLE_PREFIX = '💥 Uncaught render error:';

async function checkRoute(browser, baseUrl, routePath) {
  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes(ERROR_BOUNDARY_CONSOLE_PREFIX)) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  const url = new URL(routePath, baseUrl).toString();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Give React a moment past networkidle to finish any deferred render
    // that throws (e.g. a lazy-mounted icon inside a CopilotStep).
    await page.waitForTimeout(1500);

    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes(ERROR_BOUNDARY_TEXT)) {
      errors.push(`error boundary fallback UI rendered: page body contains "${ERROR_BOUNDARY_TEXT}"`);
    }
  } catch (navError) {
    errors.push(`navigation failed: ${navError.message}`);
  } finally {
    await page.close();
  }

  return { path: routePath, url, errors };
}

async function main() {
  if (!existsSync(distDir)) {
    console.error(`Build output not found at ${distDir}. Run the web export first.`);
    process.exit(1);
  }

  const server = await startServer();
  const baseUrl = `http://localhost:${PORT}`;
  console.log(`Serving ${distDir} at ${baseUrl}`);

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const routePath of ROUTES) {
      const result = await checkRoute(browser, baseUrl, routePath);
      results.push(result);
      console.log(`${result.errors.length === 0 ? '✅' : '❌'} ${result.url} (${result.errors.length} error(s))`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((r) => r.errors.length > 0);
  if (failed.length > 0) {
    console.error('\nWeb smoke test failed — uncaught errors on initial render:\n');
    for (const result of failed) {
      console.error(`${result.url}:`);
      for (const err of result.errors) {
        console.error(`  ${err}`);
      }
    }
    process.exit(1);
  }

  console.log('\nWeb smoke test passed — all routes rendered without uncaught errors.');
}

main().catch((error) => {
  console.error('Web smoke test crashed:', error);
  process.exit(1);
});
