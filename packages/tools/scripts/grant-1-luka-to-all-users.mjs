import dotenv from 'dotenv';
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

async function getAllUsers() {
  try {
    console.log('📋 Fetching all users from database...');
    let allUsers = [];
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
    
    console.log(`\n✅ Total users found: ${allUsers.length}\n`);
    return allUsers;
  } catch (error) {
    console.error('❌ Error getting users:', error);
    throw error;
  }
}

async function getUserBalance(userId) {
  try {
    const { data, error } = await supabase
      .from('user_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('token_symbol', 'LUKAS')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No balance found, return 0
        return 0;
      }
      console.error(`❌ Error fetching balance for user ${userId}:`, error);
      return null;
    }

    return parseFloat(data.balance.toString());
  } catch (error) {
    console.error(`❌ Error in getUserBalance for user ${userId}:`, error);
    return null;
  }
}

async function grantLukaToUser(userId) {
  try {
    // Use the add_reward function to grant 1 LUKAS
    const { data, error } = await supabase.rpc('add_reward', {
      p_user_id: userId,
      p_amount: 1.0,
      p_token_symbol: 'LUKAS',
      p_source: 'admin_grant',
      p_description: 'Grant of 1 LUKAS to all users - balance update'
    });

    if (error) {
      console.error(`❌ Error granting LUKAS to user ${userId}:`, error);
      return { success: false, error: error.message };
    }

    if (data && data.success) {
      return { success: true, balance_after: data.balance_after };
    } else {
      return { success: false, error: data?.error || 'Unknown error' };
    }
  } catch (error) {
    console.error(`❌ Exception granting LUKAS to user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting LUKAS grant to ALL users (1 LUKAS each)...\n');
  
  try {
    // Get all users
    const allUsers = await getAllUsers();
    
    if (allUsers.length === 0) {
      console.log('⚠️  No users found in database');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Process each user
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const userId = user.id;
      const email = user.email || 'no-email';
      
      console.log(`\n[${i + 1}/${allUsers.length}] Processing user: ${email} (${userId.substring(0, 8)}...)`);
      
      // Check current balance (for display only)
      const currentBalance = await getUserBalance(userId);
      
      if (currentBalance === null) {
        console.log(`   ⚠️  Could not fetch balance, but will still attempt to grant...`);
      } else {
        console.log(`   📊 Current balance: ${currentBalance} LUKAS`);
      }
      
      // Grant 1 LUKAS to everyone
      console.log(`   💰 Granting 1 LUKAS...`);
      const result = await grantLukaToUser(userId);
      
      if (result.success) {
        console.log(`   ✅ Success! New balance: ${result.balance_after} LUKAS`);
        successCount++;
      } else {
        console.log(`   ❌ Failed: ${result.error}`);
        errorCount++;
        errors.push({ userId, email, error: result.error });
      }
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully granted: ${successCount} users`);
    console.log(`⏭️  Skipped: ${skippedCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
    console.log('='.repeat(60));

    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(({ email, error }) => {
        console.log(`   - ${email}: ${error}`);
      });
    }

    console.log('\n✅ Process completed!\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();

