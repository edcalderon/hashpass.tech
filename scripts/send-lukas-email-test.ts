import { sendLukasIntroductionEmail } from '../lib/lukas-email';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function sendTestLukasEmail(locale: string = 'en') {
  // Validate required environment variables
  const requiredVars = [
    'NODEMAILER_HOST',
    'NODEMAILER_PORT',
    'NODEMAILER_USER',
    'NODEMAILER_PASS',
    'NODEMAILER_FROM'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('❌ Missing required email configuration:', missingVars.join(', '));
    return { success: false, error: 'Missing configuration' };
  }

  const toEmail = process.env.TEST_EMAIL_TO || process.env.NODEMAILER_FROM || 'admin@hashpass.tech';

  console.log(`\n📧 Sending ${locale === 'es' ? 'Spanish' : 'English'} LUKAS introduction email...`);
  console.log(`   To: ${toEmail}`);
  console.log(`   Locale: ${locale}`);

  try {
    console.log('   📤 Sending...');
    const result = await sendLukasIntroductionEmail(toEmail, locale);
    
    if (result.success) {
      console.log(`   ✅ Sent! Message ID: ${result.messageId}`);
      return result;
    } else {
      console.error(`   ❌ Error: ${result.error}`);
      return result;
    }
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    return { success: false, error: error.message };
  }
}

// Main function to send both versions
async function sendBothVersions() {
  console.log('📧 Sending test LUKAS introduction emails (English & Spanish)...\n');
  
  const results = {
    en: null as any,
    es: null as any,
  };

  // Send English version
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🇺🇸 English Version');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  results.en = await sendTestLukasEmail('en');
  
  // Wait a bit between emails
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Send Spanish version
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🇪🇸 Spanish Version');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  results.es = await sendTestLukasEmail('es');
  
  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`English: ${results.en?.success ? '✅ Sent' : '❌ Failed'}`);
  console.log(`Spanish: ${results.es?.success ? '✅ Sent' : '❌ Failed'}`);
  
  if (results.en?.success && results.es?.success) {
    console.log('\n✅ All emails sent successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Some emails failed to send');
    process.exit(1);
  }
}

async function main() {
  // Check command line arguments
  const args = process.argv.slice(2);
  if (args.includes('--es') || args.includes('--spanish')) {
    // Send only Spanish
    const result = await sendTestLukasEmail('es');
    process.exit(result.success ? 0 : 1);
  } else if (args.includes('--en') || args.includes('--english')) {
    // Send only English
    const result = await sendTestLukasEmail('en');
    process.exit(result.success ? 0 : 1);
  } else {
    // Send both by default
    await sendBothVersions();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

