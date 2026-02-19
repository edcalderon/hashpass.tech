const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSpeakerDashboard() {
  console.log('🔍 Testing speaker dashboard functionality...');
  
  try {
    // Test 1: Check if Edward is a speaker
    console.log('\n1️⃣ Checking if Edward is a speaker...');
    const { data: speakers, error: speakerError } = await supabase
      .from('bsl_speakers')
      .select('*')
      .eq('id', 'edward-calderon-speaker');
    
    if (speakerError) {
      console.log('❌ Speaker query error:', speakerError);
    } else {
      console.log('✅ Edward speaker record:', speakers[0]?.name || 'Not found');
    }
    
    // Test 2: Test the get_speaker_meeting_requests function
    console.log('\n2️⃣ Testing get_speaker_meeting_requests function...');
    const { data: functionResult, error: functionError } = await supabase
      .rpc('get_speaker_meeting_requests', {
        p_speaker_id: 'edward-calderon-speaker'
      });
    
    if (functionError) {
      console.log('❌ Function error:', functionError);
    } else {
      console.log('✅ Function result:', functionResult);
      console.log('   Success:', functionResult.success);
      console.log('   Count:', functionResult.count);
      console.log('   Requests:', functionResult.requests?.length || 0);
    }
    
    // Test 3: Check if there are any meeting requests in the database
    console.log('\n3️⃣ Checking all meeting requests in database...');
    const { data: allRequests, error: allRequestsError } = await supabase
      .from('meeting_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (allRequestsError) {
      console.log('❌ All requests query error:', allRequestsError);
    } else {
      console.log('📋 Recent meeting requests:');
      allRequests.forEach((req, index) => {
        console.log(`   ${index + 1}. ${req.requester_name} → ${req.speaker_id} (${req.status})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  console.log('\n🎉 Speaker dashboard test complete!');
}

testSpeakerDashboard();
