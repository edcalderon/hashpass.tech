const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSystem() {
  console.log('🧪 Testing the fixed meeting request system...\n');

  try {
    // Test 1: can_make_meeting_request
    console.log('1️⃣ Testing can_make_meeting_request...');
    const { data: canMakeData, error: canMakeError } = await supabase
      .rpc('can_make_meeting_request', {
        p_user_id: '13e93d3b-0556-4f0d-a065-1f013019618b',
        p_speaker_id: '550e8400-e29b-41d4-a716-446655440001',
        p_boost_amount: 0
      });

    if (canMakeError) {
      console.log('❌ can_make_meeting_request failed:', canMakeError.message);
    } else {
      console.log('✅ can_make_meeting_request works:', canMakeData);
    }

    // Test 2: insert_meeting_request
    console.log('\n2️⃣ Testing insert_meeting_request...');
    const { data: insertData, error: insertError } = await supabase
      .rpc('insert_meeting_request', {
        p_requester_id: '13e93d3b-0556-4f0d-a065-1f013019618b',
        p_speaker_id: '550e8400-e29b-41d4-a716-446655440001',
        p_speaker_name: 'Claudia Restrepo',
        p_requester_name: 'Edward Calderon',
        p_requester_company: 'HashPass',
        p_requester_title: 'CEO',
        p_requester_ticket_type: 'business',
        p_meeting_type: 'networking',
        p_message: 'Test meeting request from script',
        p_note: 'Test note',
        p_boost_amount: 0,
        p_duration_minutes: 15
      });

    if (insertError) {
      console.log('❌ insert_meeting_request failed:', insertError.message);
      console.log('Error code:', insertError.code);
      console.log('Error details:', insertError.details);
    } else {
      console.log('✅ insert_meeting_request works:', insertData);
    }

    // Test 3: get_meeting_requests_for_speaker
    console.log('\n3️⃣ Testing get_meeting_requests_for_speaker...');
    const { data: getData, error: getError } = await supabase
      .rpc('get_meeting_requests_for_speaker', {
        p_speaker_id: '550e8400-e29b-41d4-a716-446655440001'
      });

    if (getError) {
      console.log('❌ get_meeting_requests_for_speaker failed:', getError.message);
    } else {
      console.log('✅ get_meeting_requests_for_speaker works:', getData);
      console.log(`   Found ${getData ? getData.length : 0} meeting requests`);
    }

    // Test 4: Direct table query to verify data was inserted
    console.log('\n4️⃣ Testing direct table query...');
    const { data: tableData, error: tableError } = await supabase
      .from('meeting_requests')
      .select('*')
      .eq('speaker_id', '550e8400-e29b-41d4-a716-446655440001')
      .order('created_at', { ascending: false })
      .limit(5);

    if (tableError) {
      console.log('❌ Direct table query failed:', tableError.message);
    } else {
      console.log('✅ Direct table query works');
      console.log(`   Found ${tableData ? tableData.length : 0} meeting requests in table`);
      if (tableData && tableData.length > 0) {
        console.log('   Latest request:', {
          id: tableData[0].id,
          speaker_name: tableData[0].speaker_name,
          requester_name: tableData[0].requester_name,
          status: tableData[0].status,
          created_at: tableData[0].created_at
        });
      }
    }

    // Test 5: Check if functions exist in database
    console.log('\n5️⃣ Checking function existence...');
    const { data: functionsData, error: functionsError } = await supabase
      .rpc('exec', {
        sql: `
          SELECT 
            routine_name, 
            routine_type,
            data_type
          FROM information_schema.routines 
          WHERE routine_schema = 'public' 
            AND routine_name IN ('insert_meeting_request', 'can_make_meeting_request', 'get_meeting_requests_for_speaker')
          ORDER BY routine_name;
        `
      });

    if (functionsError) {
      console.log('❌ Function check failed:', functionsError.message);
    } else {
      console.log('✅ Function check works');
      console.log('   Available functions:', functionsData);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }

  console.log('\n🎉 Testing complete!');
}

testSystem();