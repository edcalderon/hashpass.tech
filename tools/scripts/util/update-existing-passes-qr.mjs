#!/usr/bin/env node
/**
 * Script to update existing passes with QR codes
 * This ensures all active passes have QR codes using the new QR system
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing environment variables');
  console.log('Please ensure EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function updateExistingPasses() {
  console.log('🔄 Updating existing passes with QR codes...\n');

  try {
    // Call the function to update existing passes
    const { data, error } = await supabase.rpc('update_existing_passes_with_qr');

    if (error) {
      console.error('❌ Error updating passes:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log('✅ No passes need updating - all active passes already have QR codes');
      return;
    }

    // Count successes and failures
    const successCount = data.filter(r => r.qr_created).length;
    const failureCount = data.filter(r => !r.qr_created).length;

    console.log(`\n📊 Results:`);
    console.log(`   ✅ Successfully created QR codes: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);

    if (successCount > 0) {
      console.log(`\n✅ Successfully updated ${successCount} pass(es) with QR codes`);
    }

    if (failureCount > 0) {
      console.log(`\n⚠️  Failed to create QR codes for ${failureCount} pass(es):`);
      data
        .filter(r => !r.qr_created)
        .forEach(r => {
          console.log(`   - Pass ${r.pass_id}: ${r.error_message || 'Unknown error'}`);
        });
    }

    console.log('\n✅ Update completed!');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the update
updateExistingPasses()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

