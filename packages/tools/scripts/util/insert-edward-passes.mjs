import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Please ensure EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file');
  process.exit(1);
}

// Use service role key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function insertEdwardPasses() {
  console.log('🎫 Inserting Edward Calderon passes...');
  
  const userId = 'edward-calderon-unal';
  const userEmail = 'ecalderon@unal.edu.co';
  const eventId = 'bsl2025';
  
  try {
    // First, let's check if Edward already has passes
    console.log('🔍 Checking existing passes for Edward Calderon...');
    
    const { data: existingPasses, error: checkError } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', eventId);
    
    if (checkError) {
      console.error('❌ Error checking existing passes:', checkError.message);
      return;
    }
    
    if (existingPasses && existingPasses.length > 0) {
      console.log(`⚠️ Edward already has ${existingPasses.length} passes. Deleting existing passes...`);
      
      const { error: deleteError } = await supabase
        .from('passes')
        .delete()
        .eq('user_id', userId)
        .eq('event_id', eventId);
      
      if (deleteError) {
        console.error('❌ Error deleting existing passes:', deleteError.message);
        return;
      }
      
      console.log('✅ Deleted existing passes');
    }
    
    // Create Edward's passes
    console.log('📝 Creating Edward Calderon\'s passes...');
    
    const passes = [
      {
        id: `${userId}-general-${Date.now()}`,
        user_id: userId,
        event_id: eventId,
        pass_type: 'general',
        status: 'active',
        purchase_date: new Date().toISOString(),
        price_usd: 99.00,
        access_features: [
          'All conferences (Nov 12-14)',
          'Booth area access',
          'Networking sessions'
        ]
      },
      {
        id: `${userId}-business-${Date.now()}`,
        user_id: userId,
        event_id: eventId,
        pass_type: 'business',
        status: 'active',
        purchase_date: new Date().toISOString(),
        price_usd: 249.00,
        access_features: [
          'All conferences (Nov 12-14)',
          'Booth area access',
          'Exclusive networking zone (B2B speed dating)',
          'Official closing party (Nov 14)'
        ]
      },
      {
        id: `${userId}-vip-${Date.now()}`,
        user_id: userId,
        event_id: eventId,
        pass_type: 'vip',
        status: 'active',
        purchase_date: new Date().toISOString(),
        price_usd: 499.00,
        access_features: [
          'All conferences (Nov 12-14)',
          'Booth area access',
          'Exclusive networking zone (B2B speed dating)',
          'Welcome cocktail (Nov 12)',
          'VIP area access (exclusive networking with speakers, sponsors, authorities)',
          'Official closing party (Nov 14)'
        ]
      }
    ];
    
    console.log('🔧 Attempting to insert passes...');
    
    const { data: insertedPasses, error: insertError } = await supabase
      .from('passes')
      .insert(passes)
      .select();
    
    if (insertError) {
      console.error('❌ Error inserting passes:', insertError.message);
      
      if (insertError.message.includes('row-level security')) {
        console.log('\n📋 RLS is blocking the insert. Please run this SQL in Supabase SQL Editor:');
        console.log('```sql');
        console.log(`-- Insert Edward Calderon's passes (bypassing RLS)
INSERT INTO public.passes (id, user_id, event_id, pass_type, status, purchase_date, price_usd, access_features) VALUES
(
    '${userId}-general-${Date.now()}',
    '${userId}',
    '${eventId}',
    'general',
    'active',
    NOW(),
    99.00,
    ARRAY[
        'All conferences (Nov 12-14)',
        'Booth area access',
        'Networking sessions'
    ]
),
(
    '${userId}-business-${Date.now()}',
    '${userId}',
    '${eventId}',
    'business',
    'active',
    NOW(),
    249.00,
    ARRAY[
        'All conferences (Nov 12-14)',
        'Booth area access',
        'Exclusive networking zone (B2B speed dating)',
        'Official closing party (Nov 14)'
    ]
),
(
    '${userId}-vip-${Date.now()}',
    '${userId}',
    '${eventId}',
    'vip',
    'active',
    NOW(),
    499.00,
    ARRAY[
        'All conferences (Nov 12-14)',
        'Booth area access',
        'Exclusive networking zone (B2B speed dating)',
        'Welcome cocktail (Nov 12)',
        'VIP area access (exclusive networking with speakers, sponsors, authorities)',
        'Official closing party (Nov 14)'
    ]
);`);
        console.log('```');
      }
      return;
    }
    
    console.log('✅ Successfully created Edward Calderon\'s passes:');
    console.log(`👤 User: ${userId} (${userEmail})`);
    console.log(`🎫 Event: ${eventId}`);
    console.log(`📊 Total passes: ${insertedPasses.length}`);
    
    insertedPasses.forEach((pass, index) => {
      console.log(`\n🎫 Pass ${index + 1}:`);
      console.log(`   Type: ${pass.pass_type.toUpperCase()}`);
      console.log(`   Price: $${pass.price_usd}`);
      console.log(`   Status: ${pass.status}`);
      console.log(`   Features: ${pass.access_features.length} access features`);
      console.log(`   ID: ${pass.id}`);
    });
    
    console.log('\n🎉 Setup complete!');
    console.log('📱 The explorer view should now display Edward Calderon\'s passes');
    console.log('🔗 Test URL: http://localhost:8081/api/bslatam/user-passes?userId=edward-calderon-unal&eventId=bsl2025');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run the script
insertEdwardPasses();
