#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeUltimateFix() {
  try {
    console.log('🔧 Executing ULTIMATE COMPLETE FIX...');
    console.log('This will fix ALL meeting request issues in one go.\n');
    
    // Read the SQL file
    const sql = fs.readFileSync('scripts/sql/ultimate-complete-fix.sql', 'utf8');
    
    // Split into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement.length === 0) continue;
      
      console.log(`🔧 Executing statement ${i + 1}/${statements.length}...`);
      console.log(`   ${statement.substring(0, 80)}...`);
      
      try {
        // Try to execute using the REST API
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          },
          body: JSON.stringify({ sql: statement })
        });
        
        if (response.ok) {
          console.log('   ✅ Success');
          successCount++;
        } else {
          const error = await response.text();
          console.log('   ❌ Error:', error);
          errorCount++;
        }
      } catch (err) {
        console.log('   ❌ Exception:', err.message);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Execution Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log('\n🎉 All statements executed successfully!');
      console.log('🧪 Now testing the fixed system...\n');
      
      // Test the system
      await testFixedSystem();
    } else {
      console.log('\n⚠️  Some statements failed. Please check the errors above.');
      console.log('You may need to run the SQL manually in the Supabase dashboard.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function testFixedSystem() {
  try {
    const testUserId = '13e93d3b-0556-4f0d-a065-1f013019618b';
    const testSpeakerId = '550e8400-e29b-41d4-a716-446655440001';
    
    // Test 1: can_make_meeting_request
    console.log('1️⃣ Testing can_make_meeting_request...');
    const { data: canRequest, error: canError } = await supabase
      .rpc('can_make_meeting_request', {
        p_user_id: testUserId,
        p_speaker_id: testSpeakerId,
        p_boost_amount: 0
      });
    
    if (canError) {
      console.log('❌ can_make_meeting_request failed:', canError.message);
    } else {
      console.log('✅ can_make_meeting_request works:', canRequest);
    }
    
    // Test 2: insert_meeting_request
    console.log('\n2️⃣ Testing insert_meeting_request...');
    const { data: insertResult, error: insertError } = await supabase
      .rpc('insert_meeting_request', {
        p_requester_id: testUserId,
        p_speaker_id: testSpeakerId,
        p_speaker_name: 'Claudia Restrepo',
        p_requester_name: 'Edward Calderon',
        p_requester_company: 'HASHPASS',
        p_requester_title: 'CEO',
        p_requester_ticket_type: 'business',
        p_meeting_type: 'networking',
        p_message: 'Test meeting request after ultimate fix',
        p_boost_amount: 0,
        p_duration_minutes: 15
      });
    
    if (insertError) {
      console.log('❌ insert_meeting_request failed:', insertError.message);
    } else {
      console.log('✅ insert_meeting_request works:', insertResult);
    }
    
    // Test 3: get_meeting_requests_for_speaker
    console.log('\n3️⃣ Testing get_meeting_requests_for_speaker...');
    const { data: requests, error: requestsError } = await supabase
      .rpc('get_meeting_requests_for_speaker', {
        p_user_id: testUserId,
        p_speaker_id: testSpeakerId
      });
    
    if (requestsError) {
      console.log('❌ get_meeting_requests_for_speaker failed:', requestsError.message);
    } else {
      console.log('✅ get_meeting_requests_for_speaker works:', requests);
      console.log(`   Found ${requests?.length || 0} meeting requests`);
    }
    
    console.log('\n🎉 Testing complete!');
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

executeUltimateFix();
