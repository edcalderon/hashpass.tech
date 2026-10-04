import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const dist = new URL('../dist/', import.meta.url);
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = new URL(`.${pathname === '/' ? '/index.html' : pathname}`, dist);
  if (!file.href.startsWith(dist.href)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[file.pathname.split('.').pop()] ?? 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.LOCALPASS_CHROME ? { executablePath: process.env.LOCALPASS_CHROME } : {}) });
try {
  for (const width of [1280, 390]) {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Guatapé, in your pocket.' }).waitFor();
      await page.getByRole('button', { name: 'Download for offline use', exact: true }).click();
      await page.getByRole('button', { name: 'Offline pack ready', exact: true }).waitFor();
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => navigator.serviceWorker.controller);
      await page.getByRole('textbox').fill('I want coffee and have 3 hours and 20,000 COP');
      await page.getByRole('button', { name: 'Build my offline plan', exact: true }).click();
      assert.match(await page.locator('.timeline article').first().innerText(), /Café La Viña/);
      const total = await page.evaluate(() => JSON.parse(localStorage.getItem('localpass-itinerary')).reduce((sum, item) => sum + item.estimated_cost, 0));
      assert.ok(total <= 20_000);
      await page.getByRole('button', { name: 'Simulate offline', exact: true }).click();
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.getByRole('status').innerText(), 'OFFLINE');
      assert.equal(await page.getByRole('button', { name: 'Simulate offline', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Español', exact: true }).click();
      await page.getByRole('button', { name: 'Negocios locales', exact: true }).click();
      const directory = await page.locator('.directory').innerText();
      assert.match(directory, /Cerca de la plaza principal/);
      assert.match(directory, /efectivo/);
      assert.doesNotMatch(directory, /Near the main square|cash|card|weather dependent|Morning hours/);
      assert.equal(await page.locator('html').getAttribute('lang'), 'es');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole('button', { name: 'Esencial', exact: true }).click();
      await page.getByRole('heading', { name: 'Información esencial', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      // A real disconnected reload must still load the cached app and create a new itinerary.
      await context.setOffline(true);
      await page.reload({ waitUntil: 'load' });
      await page.getByRole('textbox').fill('kayak 3 hours 100,000 COP');
      await page.getByRole('button', { name: 'Build my offline plan', exact: true }).click();
      assert.match(await page.locator('.timeline article').first().innerText(), /Kayak Familiar/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await context.setOffline(false);
      await page.getByRole('button', { name: 'Simulate offline', exact: true }).click();
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.getByRole('status').innerText(), 'ONLINE');
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px ${colorScheme}: budget, ranking, persistence, Spanish, offline reload, no overflow or JS errors`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
