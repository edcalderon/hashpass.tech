/**
 * Check which RPC functions exist in the Supabase database
 * Run with: npx tsx scripts/check-rpc-functions.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Critical RPC functions needed by the app
const CRITICAL_RPC_FUNCTIONS = [
  'create_default_pass',
  'get_pass_type_limits',
  'get_user_meeting_request_counts',
  'has_email_been_sent',
  'mark_email_as_sent',
  'reset_welcome_email_if_not_sent',
  'cleanup_expired_otp_codes',
  'check_wallet_auth_rate_limit',
  'suspend_qr_code',
  'reactivate_qr_code',
  'revoke_qr_code',
  'handle_booking_status_change',
  'insert_meeting_request',
  'accept_meeting_request',
  'decline_meeting_request',
  'cancel_meeting_request',
  'can_make_meeting_request',
  'book_meeting_slot',
  'generate_weekly_slots',
];

async function checkRPCFunctions() {
  console.log('🔍 Checking RPC functions in Supabase database...\n');
  console.log('📍 Database:', supabaseUrl);
  console.log('');

  const results: { name: string; exists: boolean; error?: string }[] = [];

  for (const funcName of CRITICAL_RPC_FUNCTIONS) {
    try {
      // Try to call the function with dummy parameters
      // This will fail if function doesn't exist
      const { error } = await supabase.rpc(funcName as any, {});
      
      if (error) {
        // Check error message to determine if function exists
        if (error.message.includes('function') && error.message.includes('does not exist')) {
          results.push({ name: funcName, exists: false, error: error.message });
        } else {
          // Function exists but failed due to parameters (expected)
          results.push({ name: funcName, exists: true });
        }
      } else {
        // Function exists and executed (unlikely with dummy params)
        results.push({ name: funcName, exists: true });
      }
    } catch (err: any) {
      results.push({ name: funcName, exists: false, error: err.message });
    }
  }

  // Print results
  console.log('📊 RPC Functions Status:\n');
  
  const existing = results.filter(r => r.exists);
  const missing = results.filter(r => !r.exists);

  console.log(`✅ Found: ${existing.length}/${CRITICAL_RPC_FUNCTIONS.length}`);
  existing.forEach(r => {
    console.log(`   ✓ ${r.name}`);
  });

  if (missing.length > 0) {
    console.log(`\n❌ Missing: ${missing.length}/${CRITICAL_RPC_FUNCTIONS.length}`);
    missing.forEach(r => {
      console.log(`   ✗ ${r.name}`);
      if (r.error && !r.error.includes('does not exist')) {
        console.log(`     Error: ${r.error}`);
      }
    });

    console.log('\n⚠️  ACTION REQUIRED:');
    console.log('   Run the SQL script to create missing functions:');
    console.log('   supabase/verify_and_fix_rpc_functions.sql');
    console.log('\n   Or run migrations:');
    console.log('   npx supabase db push');
  } else {
    console.log('\n✅ All critical RPC functions exist!');
  }
}

async function checkEventAgendaAccess() {
  console.log('\n🔍 Checking event_agenda table access...\n');

  try {
    const { data, error } = await supabase
      .from('event_agenda')
      .select('count')
      .limit(1);

    if (error) {
      console.log('❌ event_agenda access error:', error.message);
      if (error.message.includes('permission denied')) {
        console.log('   ⚠️  RLS policy may be blocking access');
        console.log('   Run the RLS fix in verify_and_fix_rpc_functions.sql');
      }
    } else {
      console.log('✅ event_agenda table accessible');
      console.log(`   Found records: ${data ? 'yes' : 'no'}`);
    }
  } catch (err: any) {
    console.log('❌ Error accessing event_agenda:', err.message);
  }
}

async function checkPassesTable() {
  console.log('\n🔍 Checking passes table...\n');

  try {
    const { data, error, count } = await supabase
      .from('passes')
      .select('*', { count: 'exact', head: true })
      .limit(0);

    if (error) {
      console.log('❌ passes table error:', error.message);
    } else {
      console.log('✅ passes table accessible');
      console.log(`   Total passes: ${count}`);
    }
  } catch (err: any) {
    console.log('❌ Error accessing passes:', err.message);
  }
}

async function checkNotificationsTable() {
  console.log('\n🔍 Checking notifications table...\n');

  try {
    const { data, error, count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .limit(0);

    if (error) {
      console.log('❌ notifications table error:', error.message);
      if (error.message.includes('does not exist')) {
        console.log('   ⚠️  Table missing - will be created by migration');
      }
    } else {
      console.log('✅ notifications table accessible');
      console.log(`   Total notifications: ${count}`);
    }
  } catch (err: any) {
    console.log('❌ Error accessing notifications:', err.message);
  }
}

async function main() {
  try {
    await checkRPCFunctions();
    await checkEventAgendaAccess();
    await checkPassesTable();
    await checkNotificationsTable();
    console.log('\n✅ Database check complete!\n');
  } catch (error) {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  }
}

main();
