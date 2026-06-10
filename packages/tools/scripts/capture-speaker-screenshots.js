require('dotenv').config();
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.APP_URL || 'https://bsl2025.hashpass.tech';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding');
const MOBILE_VIEWPORT = { width: 375, height: 812 }; // iPhone 12/13 size

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Screenshot configurations for speaker onboarding
const screenshots = [
  {
    name: 'accept-request-screen',
    url: '/events/bsl2025/networking/my-requests',
    description: 'Accept request screen with time slot selection',
    waitFor: 'body',
    waitTime: 5000
  },
  {
    name: 'schedule-view-screen',
    url: '/events/bsl2025/networking/my-schedule',
    description: 'Schedule view with meetings',
    waitFor: 'body',
    waitTime: 5000
  }
];

async function captureScreenshots() {
  console.log('📸 Starting speaker onboarding screenshot capture...\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Screenshot directory: ${SCREENSHOT_DIR}\n`);

  // Setup Chrome options for mobile viewport
  const options = new chrome.Options();
  options.addArguments('--headless=new');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  options.addArguments(`--window-size=${MOBILE_VIEWPORT.width},${MOBILE_VIEWPORT.height}`);
  options.addArguments('--disable-blink-features=AutomationControlled');
  options.addArguments('--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');

  let driver;
  const results = [];

  try {
    // Create driver
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    // Set viewport size
    await driver.manage().window().setRect({
      width: MOBILE_VIEWPORT.width,
      height: MOBILE_VIEWPORT.height
    });

    console.log(`✅ Chrome driver initialized (${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height})\n`);

    // Capture each screenshot
    for (const screenshot of screenshots) {
      try {
        console.log(`📷 Capturing: ${screenshot.name}`);
        console.log(`   URL: ${BASE_URL}${screenshot.url}`);
        console.log(`   Description: ${screenshot.description}`);

        // Navigate to URL
        await driver.get(`${BASE_URL}${screenshot.url}`);

        // Wait for page to load
        if (screenshot.waitFor) {
          try {
            await driver.wait(
              until.elementLocated(By.css(screenshot.waitFor)),
              screenshot.waitTime || 5000
            );
          } catch (error) {
            console.log(`   ⚠️  Wait element not found, waiting ${screenshot.waitTime}ms instead...`);
            await driver.sleep(screenshot.waitTime || 3000);
          }
        } else {
          await driver.sleep(screenshot.waitTime || 3000);
        }

        // Additional wait for animations/transitions
        await driver.sleep(2000);

        // Take screenshot
        const screenshotPath = path.join(SCREENSHOT_DIR, `${screenshot.name}.png`);
        const screenshotData = await driver.takeScreenshot();
        fs.writeFileSync(screenshotPath, screenshotData, 'base64');

        const fileSize = (fs.statSync(screenshotPath).size / 1024).toFixed(2);
        console.log(`   ✅ Saved: ${screenshotPath} (${fileSize} KB)\n`);

        results.push({
          name: screenshot.name,
          success: true,
          path: screenshotPath,
          size: fileSize
        });
      } catch (error) {
        console.error(`   ❌ Error capturing ${screenshot.name}:`, error.message);
        results.push({
          name: screenshot.name,
          success: false,
          error: error.message
        });
      }
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Screenshot Capture Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    successful.forEach(result => {
      console.log(`✅ ${result.name}: ${result.path} (${result.size} KB)`);
    });

    if (failed.length > 0) {
      console.log('\n❌ Failed screenshots:');
      failed.forEach(result => {
        console.log(`   ${result.name}: ${result.error}`);
      });
    }

    console.log(`\n📈 Total: ${successful.length}/${results.length} successful\n`);

    if (successful.length === results.length) {
      console.log('✨ All screenshots captured successfully!');
      console.log('\n💡 Next steps:');
      console.log('   1. Review the screenshots in:', SCREENSHOT_DIR);
      console.log('   2. Update email templates to use these screenshots');
      console.log('   3. Upload to S3 if needed: npm run upload:email-assets\n');
    }

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  } finally {
    if (driver) {
      await driver.quit();
      console.log('🔒 Browser closed');
    }
  }
}

// Check if app is running
async function checkAppRunning() {
  try {
    const http = require('http');
    return new Promise((resolve) => {
      const url = new URL(BASE_URL);
      const req = http.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/',
        method: 'HEAD',
        timeout: 3000
      }, (res) => {
        resolve(res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  } catch {
    return false;
  }
}

// Main execution
(async () => {
  console.log('🔍 Checking if app is running...');
  const isRunning = await checkAppRunning();
  
  if (!isRunning) {
    console.log(`\n⚠️  Warning: App doesn't seem to be running at ${BASE_URL}`);
    console.log('   Please start the app first or set APP_URL environment variable\n');
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      readline.question('Continue anyway? (y/n): ', resolve);
    });
    readline.close();
    
    if (answer.toLowerCase() !== 'y') {
      console.log('Exiting...');
      process.exit(0);
    }
  } else {
    console.log('✅ App is running!\n');
  }

  await captureScreenshots();
})();

