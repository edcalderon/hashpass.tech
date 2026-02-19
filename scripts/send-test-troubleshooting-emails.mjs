require('dotenv').config();

// Use dynamic import for TypeScript module
async function sendTestEmails() {
  // Import the email module
  const emailModule = await import('../lib/email.ts');
  const { sendTroubleshootingEmail } = emailModule;

  // Get email from command line argument or use default
  const email = process.argv[2] || process.env.TEST_EMAIL || 'support@hashpass.tech';

  console.log('📧 Sending test troubleshooting emails...');
  console.log(`   Email: ${email}`);
  console.log('');

  // Send English email
  console.log('🌐 Sending English email...');
  const englishResult = await sendTroubleshootingEmail(email, 'en');
  if (englishResult.success) {
    console.log('✅ English email sent successfully!');
    if (englishResult.messageId) {
      console.log(`   Message ID: ${englishResult.messageId}`);
    }
  } else {
    console.error('❌ Failed to send English email:', englishResult.error);
  }

  console.log('');

  // Send Spanish email
  console.log('🌐 Sending Spanish email...');
  const spanishResult = await sendTroubleshootingEmail(email, 'es');
  if (spanishResult.success) {
    console.log('✅ Spanish email sent successfully!');
    if (spanishResult.messageId) {
      console.log(`   Message ID: ${spanishResult.messageId}`);
    }
  } else {
    console.error('❌ Failed to send Spanish email:', spanishResult.error);
  }

  console.log('');
  console.log('✨ Test emails completed!');
}

sendTestEmails().catch(console.error);

