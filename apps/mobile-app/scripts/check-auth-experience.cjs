const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const sharp = require('sharp');

// Use a fresh browser and intercept passwordless requests: this check sends no email.
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript((variant) => {
      localStorage.setItem('@animation_level', 'full');
      sessionStorage.setItem('hashpass-auth-background-variant', variant);
    }, process.env.AUTH_BACKGROUND_VARIANT || 'shader');
    const requests = [];
    await page.route(/\/auth\/(magic-link|otp)(?:\?.*)?$/, async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: { success: true, data: { success: true, delivery: 'email' } } });
    });
    await page.goto(`${process.env.AUTH_TEST_ORIGIN || 'http://localhost:8081'}/auth`);
    const email = page.getByPlaceholder('Enter your email', { exact: true });
    await email.waitFor({ timeout: 120000 });
    const rejectCookies = page.getByText('Reject non-essential', { exact: true });
    if (await rejectCookies.isVisible()) await rejectCookies.click();
    for (const method of ['Magic Link', 'OTP Code']) {
      await page.getByText(method, { exact: true }).click();
      await email.fill('first@example.com');
      await page.getByText(method === 'Magic Link' ? 'Send Magic Link' : 'Send Code', { exact: true }).click();
      const reset = page.getByRole('button', { name: 'Use another email', exact: true });
      await reset.waitFor();
      if (method === 'OTP Code') {
        const digits = page.locator('input[maxlength="6"], input[maxlength="1"]');
        await digits.first().fill('1');
      }
      await reset.click();
      await email.waitFor();
      assert.equal(await email.inputValue(), '');
      await page.waitForFunction(() => document.activeElement?.getAttribute('placeholder') === 'Enter your email');
      assert.equal(await reset.count(), 0);
      assert.equal(await page.locator('input[maxlength="1"]').count(), 0);
      await email.fill('second@example.com');
      await page.getByText(method === 'Magic Link' ? 'Send Magic Link' : 'Send Code', { exact: true }).click();
      await reset.waitFor();
      assert.equal(requests.at(-1).email, 'second@example.com');
      if (method === 'OTP Code') {
        assert.deepEqual(await page.locator('input[maxlength="6"], input[maxlength="1"]').evaluateAll((nodes) => nodes.map((node) => node.value)), ['', '', '', '', '', '']);
      }
      await reset.click();
    }
    await page.mouse.move(0, 0);
    await email.blur();
    const track = page.locator('.auth-allies-track');
    await track.waitFor();
    const transform = () => track.evaluate((node) => getComputedStyle(node).transform);
    const before = await transform();
    await page.waitForTimeout(500);
    assert.notEqual(await transform(), before);
    const widths = await track.evaluate((node) => [...node.children].map((group) => group.getBoundingClientRect().width));
    assert(Math.abs(widths[0] - widths[1]) < 0.01);
    assert(widths[0] >= await page.getByTestId('auth-allies-viewport').evaluate((node) => node.clientWidth));
    await page.getByRole('button', { name: 'Pause carousel' }).click();
    assert.equal(await track.evaluate((node) => getComputedStyle(node).animationPlayState), 'paused');
    await page.getByRole('button', { name: 'Resume carousel' }).click();
    await page.mouse.move(0, 0);
    await email.focus();
    assert.equal(await track.evaluate((node) => getComputedStyle(node).animationPlayState), 'running');
    const canvas = page.getByTestId('auth-form-pane').locator('canvas');
    await canvas.waitFor();
    assert(await canvas.evaluate((node) => node.width > 0 && node.height > 0));
    assert.equal(await canvas.evaluate((node) => getComputedStyle(node.parentElement.parentElement).clipPath), 'inset(0px round 31px)');
    const firstFrame = await canvas.screenshot();
    const stats = await sharp(firstFrame).stats();
    assert(stats.channels.some((channel) => channel.stdev > 10), 'Canvas must contain rendered detail');
    await page.waitForTimeout(500);
    assert(!firstFrame.equals(await canvas.screenshot()), 'Canvas must animate');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/hashpass-auth-${process.env.AUTH_BACKGROUND_VARIANT || 'shader'}-desktop.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await track.waitFor({ state: 'detached' });
    await page.setViewportSize({ width: 390, height: 844 });
    await email.waitFor();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/hashpass-auth-mobile.png' });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log('Verified magic-link and OTP email reset, fresh requests, carousel motion/pause, reduced motion, desktop clipping and mobile overflow.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
