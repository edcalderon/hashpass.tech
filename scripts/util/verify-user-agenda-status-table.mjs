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

async function verify() {
  console.log('🔍 Verifying user_agenda_status table...\n');
  
  try {
    const { data, error } = await supabase
      .from('user_agenda_status')
      .select('id')
      .limit(1);
    
    if (error) {
      if (error.code === 'PGRST116') {
        console.log('❌ Table does not exist yet.');
        console.log('   Error:', error.message);
        return false;
      } else {
        console.log('⚠️  Error checking table:', error.message);
        return false;
      }
    }
    
    console.log('✅ Table user_agenda_status exists and is accessible!');
    console.log('✅ Migration was successful.');
    return true;
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

verify().then(success => {
  process.exit(success ? 0 : 1);
});

