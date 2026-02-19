const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRequestCounting() {
  console.log('🧪 Testing the new request counting system...\n');

  const testUserId = '13e93d3b-0556-4f0d-a065-1f013019618b';

  try {
    // Test 1: Get user meeting request counts
    console.log('1️⃣ Testing get_user_meeting_request_counts...');
    const { data: countsData, error: countsError } = await supabase
      .rpc('get_user_meeting_request_counts', {
        p_user_id: testUserId
      });

    if (countsError) {
      console.log('❌ get_user_meeting_request_counts failed:', countsError.message);
    } else {
      console.log('✅ get_user_meeting_request_counts works:');
      console.log('   Pass Type:', countsData.pass_type);
      console.log('   Max Requests:', countsData.max_requests);
      console.log('   Total Requests:', countsData.total_requests);
      console.log('   Pending Requests:', countsData.pending_requests);
      console.log('   Approved Requests:', countsData.approved_requests);
      console.log('   Declined Requests:', countsData.declined_requests);
      console.log('   Cancelled Requests:', countsData.cancelled_requests);
      console.log('   Remaining Requests:', countsData.remaining_requests);
      console.log('   Max Boost:', countsData.max_boost);
      console.log('   Used Boost:', countsData.used_boost);
      console.log('   Remaining Boost:', countsData.remaining_boost);
    }

    // Test 2: Check actual meeting requests in database
    console.log('\n2️⃣ Checking actual meeting requests in database...');
    const { data: actualRequests, error: actualError } = await supabase
      .from('meeting_requests')
      .select('*')
      .eq('requester_id', testUserId)
      .order('created_at', { ascending: false });

    if (actualError) {
      console.log('❌ Direct query failed:', actualError.message);
    } else {
      console.log('✅ Direct query works:');
      console.log(`   Found ${actualRequests ? actualRequests.length : 0} meeting requests`);
      
      if (actualRequests && actualRequests.length > 0) {
        console.log('   Recent requests:');
        actualRequests.slice(0, 3).forEach((req, index) => {
          console.log(`     ${index + 1}. ${req.speaker_name} - ${req.status} (${req.created_at})`);
        });
      }
    }

    // Test 3: Test can_make_meeting_request with real counts
    console.log('\n3️⃣ Testing can_make_meeting_request with real counts...');
    const { data: canMakeData, error: canMakeError } = await supabase
      .rpc('can_make_meeting_request', {
        p_user_id: testUserId,
        p_speaker_id: '550e8400-e29b-41d4-a716-446655440001',
        p_boost_amount: 0
      });

    if (canMakeError) {
      console.log('❌ can_make_meeting_request failed:', canMakeError.message);
    } else {
      console.log('✅ can_make_meeting_request works:');
      console.log('   Can Request:', canMakeData.can_request);
      console.log('   Reason:', canMakeData.reason);
      console.log('   Pass Type:', canMakeData.pass_type);
      console.log('   Remaining Requests:', canMakeData.remaining_requests);
      console.log('   Total Requests:', canMakeData.total_requests);
    }

    // Test 4: Create a test meeting request to see if counts update
    console.log('\n4️⃣ Testing meeting request creation...');
    const { data: insertData, error: insertError } = await supabase
      .rpc('insert_meeting_request', {
        p_requester_id: testUserId,
        p_speaker_id: '550e8400-e29b-41d4-a716-446655440001',
        p_speaker_name: 'Test Speaker',
        p_requester_name: 'Test User',
        p_requester_company: 'Test Company',
        p_requester_title: 'Test Title',
        p_requester_ticket_type: 'business',
        p_meeting_type: 'networking',
        p_message: 'Test request for counting',
        p_note: 'Test note',
        p_boost_amount: 0,
        p_duration_minutes: 15
      });

    if (insertError) {
      console.log('❌ insert_meeting_request failed:', insertError.message);
    } else {
      console.log('✅ insert_meeting_request works:', insertData);
      
      // Check counts again after insertion
      console.log('\n5️⃣ Checking counts after insertion...');
      const { data: newCountsData, error: newCountsError } = await supabase
        .rpc('get_user_meeting_request_counts', {
          p_user_id: testUserId
        });

      if (newCountsError) {
        console.log('❌ New counts failed:', newCountsError.message);
      } else {
        console.log('✅ New counts:');
        console.log('   Total Requests:', newCountsData.total_requests);
        console.log('   Remaining Requests:', newCountsData.remaining_requests);
      }
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }

  console.log('\n🎉 Request counting test complete!');
}

testRequestCounting();
