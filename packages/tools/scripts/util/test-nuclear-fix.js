const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testNuclearFix() {
  console.log('🧪 Testing NUCLEAR FIX for insert_meeting_request...\n');

  try {
    // Test 1: Try to create a meeting request
    console.log('1️⃣ Testing insert_meeting_request function...');
    const { data: result, error } = await supabase
      .rpc('insert_meeting_request', {
        p_requester_id: '13e93d3b-0556-4f0d-a065-1f013019618b',
        p_speaker_id: '550e8400-e29b-41d4-a716-446655440001',
        p_speaker_name: 'Test Speaker',
        p_requester_name: 'Test User',
        p_requester_company: 'Test Company',
        p_requester_title: 'Test Title',
        p_requester_ticket_type: 'business',
        p_meeting_type: 'networking',
        p_message: 'Test message after nuclear fix',
        p_note: 'Test note',
        p_boost_amount: 0,
        p_duration_minutes: 15
      });

    if (error) {
      console.log('❌ Function still has error:', error.message);
      console.log('Error code:', error.code);
      console.log('Error details:', error.details);
    } else {
      console.log('✅ Function works! Result:', result);
      
      if (result && result.success) {
        console.log('🎉 SUCCESS: Meeting request created with ID:', result.request_id);
        
        // Test 2: Verify the request was actually inserted
        console.log('\n2️⃣ Verifying request was inserted...');
        const { data: insertedRequest, error: fetchError } = await supabase
          .from('meeting_requests')
          .select('*')
          .eq('id', result.request_id)
          .single();
        
        if (fetchError) {
          console.log('❌ Could not fetch inserted request:', fetchError.message);
        } else {
          console.log('✅ Request found in database:', {
            id: insertedRequest.id,
            speaker_name: insertedRequest.speaker_name,
            requester_name: insertedRequest.requester_name,
            status: insertedRequest.status,
            created_at: insertedRequest.created_at
          });
        }
        
        // Test 3: Check updated counts
        console.log('\n3️⃣ Checking updated request counts...');
        const { data: counts, error: countsError } = await supabase
          .rpc('get_user_meeting_request_counts', {
            p_user_id: '13e93d3b-0556-4f0d-a065-1f013019618b'
          });
        
        if (countsError) {
          console.log('❌ Could not get counts:', countsError.message);
        } else {
          console.log('✅ Updated counts:', {
            total_requests: counts.total_requests,
            remaining_requests: counts.remaining_requests,
            pending_requests: counts.pending_requests
          });
        }
      }
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }

  console.log('\n🎉 Nuclear fix test complete!');
}

testNuclearFix();
