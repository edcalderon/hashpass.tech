import { sendLukasIntroductionEmail } from '../lib/lukas-email';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

// Initialize Supabase
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   EXPO_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Validate email configuration
const requiredEmailVars = [
  'NODEMAILER_HOST',
  'NODEMAILER_PORT',
  'NODEMAILER_USER',
  'NODEMAILER_PASS',
  'NODEMAILER_FROM'
];

const missingEmailVars = requiredEmailVars.filter(varName => !process.env[varName]);
if (missingEmailVars.length > 0) {
  console.error(`❌ Missing required email configuration: ${missingEmailVars.join(', ')}`);
  process.exit(1);
}

async function getAllUsers() {
  try {
    console.log('📋 Fetching all users from database...');
    let allUsers: any[] = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const { data: users, error } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: 1000
      });
      
      if (error) {
        console.error('❌ Error fetching users:', error);
        throw error;
      }
      
      if (users && users.users && users.users.length > 0) {
        allUsers = allUsers.concat(users.users);
        console.log(`   Fetched ${users.users.length} users (total: ${allUsers.length})`);
        
        // Check if there are more pages
        hasMore = users.users.length === 1000;
        page++;
      } else {
        hasMore = false;
      }
    }
    
    return allUsers;
  } catch (error) {
    console.error('❌ Error getting users:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting LUKAS introduction email campaign to all users...\n');
  console.log('⚠️  PRODUCTION MODE - This will send emails to ALL users in BOTH languages!\n');
  
  // Confirm production mode
  if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️  WARNING: NODE_ENV is not set to "production"');
    console.log('   Set NODE_ENV=production to proceed\n');
  }
  
  try {
    // Get all users
    const allUsers = await getAllUsers();
    
    if (allUsers.length === 0) {
      console.log('⚠️  No users found in database');
      return;
    }
    
    console.log(`\n✅ Total users found: ${allUsers.length}\n`);
    
    // Statistics
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const results = {
      en: { sent: 0, errors: 0 },
      es: { sent: 0, errors: 0 }
    };
    const errors: Array<{ email: string; locale: string; error: string }> = [];
    
    // Process each user
    const DELAY_BETWEEN_EMAILS = 1000; // 1 second delay to avoid rate limiting
    
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const email = user.email;
      const userId = user.id;
      
      if (!email) {
        console.log(`⚠️  [${i + 1}/${allUsers.length}] Skipping user ${userId} - no email address`);
        skippedCount++;
        continue;
      }
      
      console.log(`\n[${i + 1}/${allUsers.length}] 📧 Processing: ${email}`);
      
      // Send both English and Spanish versions
      const locales = ['en', 'es'] as const;
      
      for (const locale of locales) {
        try {
          console.log(`   📤 Sending ${locale === 'es' ? 'Spanish' : 'English'} version...`);
          const result = await sendLukasIntroductionEmail(email, locale);
          
          if (result.success) {
            successCount++;
            results[locale].sent++;
            console.log(`   ✅ ${locale.toUpperCase()} sent successfully (Message ID: ${result.messageId})`);
          } else {
            errorCount++;
            results[locale].errors++;
            errors.push({ email, locale, error: result.error || 'Unknown error' });
            console.log(`   ❌ ${locale.toUpperCase()} failed: ${result.error}`);
          }
          
          // Small delay between languages for the same user
          if (locale === 'en') {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error: any) {
          errorCount++;
          results[locale].errors++;
          const errorMsg = error?.message || 'Unknown error';
          errors.push({ email, locale, error: errorMsg });
          console.log(`   ❌ ${locale.toUpperCase()} error: ${errorMsg}`);
        }
      }
      
      // Delay between users to avoid rate limiting
      if (i < allUsers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EMAILS));
      }
      
      // Progress indicator every 10 users
      if ((i + 1) % 10 === 0) {
        console.log(`\n📊 Progress: ${i + 1}/${allUsers.length} users processed`);
        console.log(`   ✅ Success: ${successCount} | ❌ Errors: ${errorCount} | ⏭️  Skipped: ${skippedCount}\n`);
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Campaign Summary');
    console.log('='.repeat(60));
    console.log(`Total users processed: ${allUsers.length}`);
    console.log(`Total emails sent: ${successCount}`);
    console.log(`Total errors: ${errorCount}`);
    console.log(`Skipped (no email): ${skippedCount}`);
    console.log(`\nBy language:`);
    console.log(`  English (en): ${results.en.sent} sent, ${results.en.errors} errors`);
    console.log(`  Spanish (es): ${results.es.sent} sent, ${results.es.errors} errors`);
    console.log('='.repeat(60));
    
    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.slice(0, 20).forEach(({ email, locale, error }) => {
        console.log(`   ${email} (${locale}): ${error}`);
      });
      if (errors.length > 20) {
        console.log(`   ... and ${errors.length - 20} more errors`);
      }
    }
    
    console.log('\n');
  } catch (error: any) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => {
    console.log('✅ Campaign completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Campaign failed:', error);
    process.exit(1);
  });

