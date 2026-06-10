import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestUserPass() {
  try {
    // First, get the user ID for ecalderon@unal.edu.co
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error('Error fetching users:', userError);
      return;
    }

    const testUser = users.users.find(user => user.email === 'ecalderon@unal.edu.co');
    
    if (!testUser) {
      console.error('User ecalderon@unal.edu.co not found');
      return;
    }

    console.log('Found user:', testUser.id, testUser.email);

    // Create a pass for the user using the create_default_pass function
    const { data, error } = await supabase
      .rpc('create_default_pass', {
        p_user_id: testUser.id,
        p_pass_type: 'business'
      });

    if (error) {
      console.error('Error creating pass:', error);
      return;
    }

    console.log('✅ Pass created successfully with ID:', data);

    // Now get the pass info to verify it was created correctly
    const { data: passInfo, error: passInfoError } = await supabase
      .rpc('get_user_pass_info', {
        p_user_id: testUser.id
      });

    if (passInfoError) {
      console.error('Error getting pass info:', passInfoError);
    } else {
      console.log('✅ Pass info retrieved:', passInfo);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

createTestUserPass();
