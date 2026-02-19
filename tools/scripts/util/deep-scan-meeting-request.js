const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deepScan() {
  console.log('🔍 DEEP SCAN: Finding the source of can_make_meeting_request(uuid, text, numeric) error...\n');
  
  // 1. Test the exact function call that's failing
  console.log('1️⃣ Testing exact function call that fails...');
  const { data: testData, error: testError } = await supabase
    .rpc('insert_meeting_request', {
      p_requester_id: '13e93d3b-0556-4f0d-a065-1f013019618b',
      p_speaker_id: '550e8400-e29b-41d4-a716-446655440001',
      p_speaker_name: 'Test Speaker',
      p_requester_name: 'Test User',
      p_requester_company: 'Test Company',
      p_requester_title: 'Test Title',
      p_requester_ticket_type: 'business',
      p_meeting_type: 'networking',
      p_message: 'Test message',
      p_note: 'Test note',
      p_boost_amount: 0,
      p_duration_minutes: 15
    });
  
  console.log('Test result:', testData);
  if (testError) {
    console.log('Test error:', testError.message);
    console.log('Error code:', testError.code);
    console.log('Error details:', testError.details);
  }
  
  // 2. Check if can_make_meeting_request function exists with different signatures
  console.log('\n2️⃣ Testing different can_make_meeting_request signatures...');
  
  // Test TEXT version
  try {
    const { data: textResult, error: textError } = await supabase
      .rpc('can_make_meeting_request', {
        p_user_id: '13e93d3b-0556-4f0d-a065-1f013019618b',
        p_speaker_id: '550e8400-e29b-41d4-a716-446655440001',
        p_boost_amount: 0
      });
    console.log('✅ TEXT version works:', textResult);
  } catch (e) {
    console.log('❌ TEXT version failed:', e.message);
  }
  
  // 3. Check what's in the meeting_requests table
  console.log('\n3️⃣ Checking meeting_requests table structure...');
  const { data: tableData, error: tableError } = await supabase
    .from('meeting_requests')
    .select('*')
    .limit(1);
  
  if (tableError) {
    console.log('❌ Table error:', tableError.message);
  } else {
    console.log('✅ Table accessible, sample data:', tableData);
  }
  
  // 4. Check if there are any triggers or constraints
  console.log('\n4️⃣ Checking for database constraints and triggers...');
  try {
    // Try to insert a test record to see what happens
    const { data: insertTest, error: insertError } = await supabase
      .from('meeting_requests')
      .insert({
        requester_id: '13e93d3b-0556-4f0d-a065-1f013019618b',
        speaker_id: 'test-speaker-id',
        speaker_name: 'Test Speaker',
        requester_name: 'Test User',
        requester_company: 'Test Company',
        requester_title: 'Test Title',
        requester_ticket_type: 'business',
        meeting_type: 'networking',
        message: 'Test message',
        note: 'Test note',
        boost_amount: 0,
        duration_minutes: 15,
        status: 'pending'
      })
      .select();
    
    if (insertError) {
      console.log('❌ Direct insert error:', insertError.message);
      console.log('Error code:', insertError.code);
      console.log('Error details:', insertError.details);
    } else {
      console.log('✅ Direct insert works:', insertTest);
      
      // Clean up the test record
      if (insertTest && insertTest[0]) {
        await supabase
          .from('meeting_requests')
          .delete()
          .eq('id', insertTest[0].id);
        console.log('🧹 Cleaned up test record');
      }
    }
  } catch (e) {
    console.log('❌ Direct insert failed:', e.message);
  }
  
  // 5. Check the current insert_meeting_request function signature
  console.log('\n5️⃣ Checking current function signatures...');
  try {
    // Try different parameter combinations to see what works
    const testCases = [
      {
        name: 'All TEXT parameters',
        params: {
          p_requester_id: '13e93d3b-0556-4f0d-a065-1f013019618b',
          p_speaker_id: '550e8400-e29b-41d4-a716-446655440001',
          p_speaker_name: 'Test Speaker',
          p_requester_name: 'Test User',
          p_requester_company: 'Test Company',
          p_requester_title: 'Test Title',
          p_requester_ticket_type: 'business',
          p_meeting_type: 'networking',
          p_message: 'Test message',
          p_note: 'Test note',
          p_boost_amount: 0,
          p_duration_minutes: 15
        }
      }
    ];
    
    for (const testCase of testCases) {
      console.log(`\n   Testing ${testCase.name}...`);
      const { data: result, error: error } = await supabase
        .rpc('insert_meeting_request', testCase.params);
      
      if (error) {
        console.log(`   ❌ ${testCase.name} failed:`, error.message);
        console.log(`   Error code:`, error.code);
      } else {
        console.log(`   ✅ ${testCase.name} works:`, result);
      }
    }
  } catch (e) {
    console.log('❌ Function signature test failed:', e.message);
  }
}

deepScan().catch(console.error);
