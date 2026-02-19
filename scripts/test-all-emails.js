require('dotenv').config();
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runScript(scriptPath, scriptName) {
  log(`\n${'='.repeat(70)}`, 'cyan');
  log(`📧 Running: ${scriptName}`, 'bright');
  log(`${'='.repeat(70)}`, 'cyan');
  
  try {
    const { stdout, stderr } = await execAsync(`node ${scriptPath}`, {
      env: { ...process.env },
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });
    
    if (stdout) {
      console.log(stdout);
    }
    if (stderr) {
      console.error(stderr);
    }
    
    return { success: true, output: stdout, error: stderr };
  } catch (error) {
    log(`❌ Error running ${scriptName}: ${error.message}`, 'red');
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    return { success: false, error: error.message, output: error.stdout, stderr: error.stderr };
  }
}

async function sendAllEmails() {
  log('\n╔══════════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║          📧 HashPass Email Test Suite - All Emails                  ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════════╝', 'cyan');
  
  const fromEmail = process.env.NODEMAILER_FROM_CONTACT || process.env.NODEMAILER_FROM || 'contact@hashpass.tech';
  const toEmail = process.env.TEST_EMAIL_TO || 'admin@hashpass.tech';
  
  // Parse multiple recipients (comma-separated)
  const recipients = toEmail.split(',').map(email => email.trim()).filter(email => email);
  
  log('\n📋 Email Configuration:', 'bright');
  log(`   From: ${fromEmail}`, 'cyan');
  log(`   To: ${recipients.join(', ')}`, 'cyan');
  log(`   Total emails to send: ${6 * recipients.length} (3 types × 2 languages × ${recipients.length} recipient${recipients.length > 1 ? 's' : ''})`, 'cyan');
  
  const results = {
    welcome: { en: null, es: null },
    userOnboarding: { en: null, es: null },
    speakerOnboarding: { en: null, es: null },
  };
  
  const scripts = [
    {
      path: 'scripts/test-welcome-email.js',
      name: 'Welcome Email (EN + ES)',
      key: 'welcome',
    },
    {
      path: 'scripts/test-user-onboarding-email.js',
      name: 'User Onboarding Email (EN + ES)',
      key: 'userOnboarding',
    },
    {
      path: 'scripts/test-speaker-onboarding-email.js',
      name: 'Speaker Onboarding Email (EN + ES)',
      key: 'speakerOnboarding',
    },
  ];
  
  // Run each script sequentially with a delay between them
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const result = await runScript(script.path, script.name);
    
    // Wait a bit before running the next script to avoid rate limiting
    if (i < scripts.length - 1) {
      log(`\n⏳ Waiting 3 seconds before next email batch...`, 'yellow');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Final summary
  log('\n\n╔══════════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║                    📊 Final Summary                                 ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════════╝', 'cyan');
  
  log('\n✨ All email batches completed!', 'green');
  log('\n📧 Email Types Sent:', 'bright');
  log('   1. ✅ Welcome Email (English + Spanish)', 'green');
  log('   2. ✅ User Onboarding Email (English + Spanish)', 'green');
  log('   3. ✅ Speaker Onboarding Email (English + Spanish)', 'green');
  log('\n📬 Check your inbox at:', 'bright');
  recipients.forEach((email, index) => {
    log(`   ${index + 1}. ${email}`, 'cyan');
  });
  log(`\n   Total: ${6 * recipients.length} emails sent (3 types × 2 languages × ${recipients.length} recipient${recipients.length > 1 ? 's' : ''})`, 'cyan');
  log('\n💡 Tip: Some email clients may group similar emails together.', 'yellow');
  log(`   Look for ${6 * recipients.length} separate emails across all inboxes.\n`, 'yellow');
}

// Run the script
sendAllEmails()
  .then(() => {
    log('\n✅ Test suite completed successfully!', 'green');
    process.exit(0);
  })
  .catch((error) => {
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });

