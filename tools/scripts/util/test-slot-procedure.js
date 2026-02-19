// Load environment variables
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testStoredProcedure() {
  try {
    console.log('Testing get_available_slots stored procedure...');
    
    // Test parameters
    const params = {
      target_user_id: 'test-user-123',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    console.log('Calling with params:', JSON.stringify(params, null, 2));
    
    // Call the stored procedure
    const { data, error } = await supabase
      .rpc('get_available_slots', params);
    
    if (error) {
      console.error('Error calling stored procedure:');
      console.error('Code:', error.code);
      console.error('Message:', error.message);
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
    } else {
      console.log('Stored procedure executed successfully');
      console.log('Result:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

// Run the test
testStoredProcedure();
