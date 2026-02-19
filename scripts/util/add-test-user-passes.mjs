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

async function addTestUserAndPasses() {
  console.log('👤 Adding test user Edward Calderon with all pass types...');
  
  const userId = 'edward-calderon-unal';
  const userEmail = 'ecalderon@unal.edu.co';
  const eventId = 'bsl2025';
  
  try {
    // First, let's check if the passes table exists
    console.log('🔍 Checking if passes table exists...');
    const { data: existingPasses, error: checkError } = await supabase
      .from('passes')
      .select('*')
      .limit(1);
    
    if (checkError) {
      console.error('❌ Passes table does not exist:', checkError.message);
      console.log('📋 Please run the migration: supabase/migrations/20250115000009_passes.sql');
      return;
    }
    
    console.log('✅ Passes table exists');
    
    // Check if user already has passes
    const { data: existingUserPasses, error: userCheckError } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', eventId);
    
    if (userCheckError) {
      console.error('❌ Error checking existing user passes:', userCheckError.message);
      return;
    }
    
    if (existingUserPasses && existingUserPasses.length > 0) {
      console.log(`⚠️ User ${userId} already has ${existingUserPasses.length} passes. Deleting existing passes...`);
      
      // Delete existing passes
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
    
    // Create all 3 types of passes for Edward Calderon
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
    
    console.log('📝 Creating passes for Edward Calderon...');
    console.log('👤 User ID:', userId);
    console.log('📧 Email:', userEmail);
    console.log('🎫 Event ID:', eventId);
    
    // Insert the passes
    const { data: insertedPasses, error: insertError } = await supabase
      .from('passes')
      .insert(passes)
      .select();
    
    if (insertError) {
      console.error('❌ Error inserting passes:', insertError.message);
      return;
    }
    
    console.log('✅ Successfully created passes for Edward Calderon:');
    insertedPasses.forEach((pass, index) => {
      console.log(`\n🎫 Pass ${index + 1}:`);
      console.log(`   Type: ${pass.pass_type.toUpperCase()}`);
      console.log(`   Price: $${pass.price_usd}`);
      console.log(`   Status: ${pass.status}`);
      console.log(`   Features: ${pass.access_features.length} access features`);
      console.log(`   ID: ${pass.id}`);
    });
    
    console.log('\n📊 Summary:');
    console.log(`✅ Created ${insertedPasses.length} passes for user: ${userId}`);
    console.log(`📧 Email: ${userEmail}`);
    console.log(`🎫 Event: ${eventId}`);
    
    // Test the API endpoint
    console.log('\n🔗 To test the passes, use this URL:');
    console.log(`http://localhost:3000/api/bslatam/user-passes?userId=${userId}&eventId=${eventId}`);
    
    console.log('\n📱 In the explorer view, the passes should now display for user:', userId);
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run the script
addTestUserAndPasses();
