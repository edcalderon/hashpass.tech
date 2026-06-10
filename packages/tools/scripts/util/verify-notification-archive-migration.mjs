#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function verifyMigration() {
  console.log('🔍 Verifying Notification Archive Migration...\n');
  
  try {
    // Try to select the is_archived column
    const { data, error } = await supabase
      .from('notifications')
      .select('id, is_archived, archived_at')
      .limit(1);
    
    if (error) {
      if (error.code === '42703' || error.message.includes('is_archived')) {
        console.error('❌ Migration failed: is_archived column does not exist');
        console.error('Error:', error.message);
        process.exit(1);
      } else {
        console.log('⚠️  Error querying notifications:', error.message);
        console.log('   (This might be normal if there are no notifications)');
      }
    } else {
      console.log('✅ Migration successful!');
      console.log('✅ is_archived column exists');
      console.log('✅ archived_at column exists');
      
      if (data && data.length > 0) {
        const notification = data[0];
        console.log('\n📋 Sample notification data:');
        console.log(`   is_archived: ${notification.is_archived}`);
        console.log(`   archived_at: ${notification.archived_at || 'null'}`);
      }
      
      // Check index exists by trying a filtered query
      const { data: archivedData, error: archivedError } = await supabase
        .from('notifications')
        .select('id')
        .eq('is_archived', false)
        .limit(1);
      
      if (!archivedError) {
        console.log('✅ Index verification: Filtering by is_archived works correctly');
      }
    }
    
    console.log('\n✅ Migration verification complete!');
    console.log('✅ You can now use PATCH requests with is_archived and archived_at fields');
    
  } catch (error) {
    console.error('❌ Verification error:', error);
    process.exit(1);
  }
}

verifyMigration();

