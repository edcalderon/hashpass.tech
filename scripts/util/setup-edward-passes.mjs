import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Please ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupEdwardPasses() {
  console.log('🎫 Setting up Edward Calderon passes...');
  
  const userId = 'edward-calderon-unal';
  const userEmail = 'ecalderon@unal.edu.co';
  const eventId = 'bsl2025';
  
  try {
    // Step 1: Create the passes table
    console.log('🏗️ Creating passes table...');
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public.passes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          pass_type TEXT NOT NULL CHECK (pass_type IN ('general', 'vip', 'business')),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
          purchase_date TIMESTAMPTZ DEFAULT NOW(),
          price_usd DECIMAL(10,2),
          access_features TEXT[] DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    
    // Try to create table using direct SQL execution
    try {
      const { error: tableError } = await supabase
        .from('passes')
        .select('*')
        .limit(1);
      
      if (tableError && tableError.message.includes('does not exist')) {
        console.log('📋 Passes table does not exist. Please create it manually in Supabase SQL Editor:');
        console.log('```sql');
        console.log(createTableSQL);
        console.log('```');
        console.log('\nThen run this script again.');
        return;
      }
    } catch (e) {
      console.log('📋 Passes table does not exist. Please create it manually in Supabase SQL Editor:');
      console.log('```sql');
      console.log(createTableSQL);
      console.log('```');
      console.log('\nThen run this script again.');
      return;
    }
    
    console.log('✅ Passes table exists');
    
    // Step 2: Check if Edward already has passes
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
    
    // Step 3: Create Edward's passes
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
    
    const { data: insertedPasses, error: insertError } = await supabase
      .from('passes')
      .insert(passes)
      .select();
    
    if (insertError) {
      console.error('❌ Error inserting passes:', insertError.message);
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
    console.log('🔗 Test URL: http://localhost:3000/api/bslatam/user-passes?userId=edward-calderon-unal&eventId=bsl2025');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run the script
setupEdwardPasses();
