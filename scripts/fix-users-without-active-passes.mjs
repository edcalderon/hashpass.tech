#!/usr/bin/env node
/**
 * Script to fix users who don't have active passes
 * This creates active passes for users who only have cancelled/expired passes
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
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

async function fixUsersWithoutActivePasses() {
  console.log('🔍 Finding users without active passes...\n');

  try {
    // Get all users from auth.users
    const { data: allUsersData, error: allUsersError } = await supabase.auth.admin.listUsers();
      
      if (allUsersError) {
        console.error('❌ Error fetching users:', allUsersError);
        return;
      }

    if (!allUsersData || !allUsersData.users || allUsersData.users.length === 0) {
      console.log('✅ No users found in the system.');
      return;
    }

    console.log(`📊 Total users found: ${allUsersData.users.length}\n`);
    console.log('🔍 Checking each user for active passes...\n');

      const usersToFix = [];
    let usersWithActivePasses = 0;
    let usersWithNoPasses = 0;
    let usersWithOnlyInactivePasses = 0;

    // Check each user for active passes
    for (const user of allUsersData.users) {
      // Skip users without email (system users, etc.)
      if (!user.email) {
        continue;
      }

        const { data: passes, error: passesError } = await supabase
          .from('passes')
        .select('status, pass_type, created_at')
          .eq('user_id', user.id)
          .eq('event_id', 'bsl2025');

        if (passesError) {
        console.error(`❌ Error fetching passes for ${user.email}:`, passesError.message);
          continue;
        }

      const activePasses = passes?.filter(p => p.status === 'active') || [];
      const inactivePasses = passes?.filter(p => ['cancelled', 'expired', 'used', 'suspended'].includes(p.status)) || [];
      const totalPasses = passes?.length || 0;

      if (activePasses.length > 0) {
        usersWithActivePasses++;
        // User has active pass, skip
        continue;
      }

      // User doesn't have active pass - add to fix list
      if (totalPasses === 0) {
        usersWithNoPasses++;
        usersToFix.push({
          id: user.id,
          email: user.email,
          reason: 'no_passes',
          inactive_passes: 0
        });
      } else if (inactivePasses.length > 0) {
        usersWithOnlyInactivePasses++;
          usersToFix.push({
            id: user.id,
            email: user.email,
          reason: 'only_inactive_passes',
            inactive_passes: inactivePasses.length
          });
        }
      }

    console.log(`📊 Summary of check:`);
    console.log(`   ✅ Users with active passes: ${usersWithActivePasses}`);
    console.log(`   ⚠️  Users with no passes: ${usersWithNoPasses}`);
    console.log(`   ⚠️  Users with only inactive passes: ${usersWithOnlyInactivePasses}`);
    console.log(`   📋 Total users needing fixes: ${usersToFix.length}\n`);

      if (usersToFix.length === 0) {
      console.log('✅ All users have active passes!');
        return;
      }

    console.log(`📋 Users that need active passes:\n`);
      for (const user of usersToFix) {
      const reasonText = user.reason === 'no_passes' 
        ? 'no passes' 
        : `${user.inactive_passes} inactive pass(es)`;
      console.log(`   - ${user.email} (${reasonText})`);
      }

      console.log('\n🔧 Creating active passes for these users...\n');

      let successCount = 0;
      let errorCount = 0;

      for (const user of usersToFix) {
        try {
          const { data, error } = await supabase.rpc('create_default_pass', {
            p_user_id: user.id,
            p_pass_type: 'general'
          });

          if (error) {
            console.error(`❌ Error creating pass for ${user.email}:`, error.message);
            errorCount++;
          } else {
          const passId = data || 'unknown';
          console.log(`✅ Created active pass for ${user.email} (pass ID: ${passId})`);
            successCount++;
          }
        } catch (err) {
          console.error(`❌ Exception creating pass for ${user.email}:`, err.message);
          errorCount++;
        }
      }

    console.log(`\n✅ Final Summary:`);
    console.log(`   ✅ Successfully created: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total processed: ${usersToFix.length}`);
    console.log(`   ✅ Users with active passes (after fix): ${usersWithActivePasses + successCount}`);
  } catch (error) {
    console.error('❌ Error in fixUsersWithoutActivePasses:', error);
    throw error;
  }
}

// Run the script
fixUsersWithoutActivePasses()
  .then(() => {
    console.log('\n✅ Script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

