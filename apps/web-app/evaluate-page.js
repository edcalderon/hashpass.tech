const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();

    page.on('console', msg => console.log(`[CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[PAGE ERROR]: ${err.message}`));

    await page.goto('http://localhost:8081/auth');
    await page.waitForTimeout(3000);
    console.log('[DOM HTML]:', await page.evaluate(() => document.documentElement.innerHTML));

    await browser.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
