const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testCancelFunction() {
  console.log('🧪 Testing cancel_meeting_request function...');
  
  // Test with a real user ID and request ID
  const testUserId = '13e93d3b-0556-4f0d-a065-1f013019618b';
  
  try {
    // First, let's find a pending request for this user
    console.log('\n1️⃣ Looking for pending requests for user:', testUserId);
    
    const { data: requests, error: fetchError } = await supabase
      .from('meeting_requests')
      .select('*')
      .eq('requester_id', testUserId)
      .eq('status', 'pending')
      .limit(1);
    
    if (fetchError) {
      console.error('❌ Error fetching requests:', fetchError);
      return;
    }
    
    if (!requests || requests.length === 0) {
      console.log('ℹ️ No pending requests found for this user');
      console.log('Let\'s check all requests for this user...');
      
      const { data: allRequests, error: allError } = await supabase
        .from('meeting_requests')
        .select('*')
        .eq('requester_id', testUserId)
        .limit(5);
      
      if (allError) {
        console.error('❌ Error fetching all requests:', allError);
        return;
      }
      
      console.log('📋 All requests for user:', allRequests);
      return;
    }
    
    const testRequest = requests[0];
    console.log('📋 Found pending request:', testRequest.id);
    
    // Test the cancel function
    console.log('\n2️⃣ Testing cancel_meeting_request function...');
    
    const { data: result, error } = await supabase
      .rpc('cancel_meeting_request', {
        p_request_id: testRequest.id.toString(),
        p_user_id: testUserId.toString()
      });
    
    console.log('🔄 Cancel result:', result);
    if (error) console.log('❌ Cancel error:', error);
    
    if (result && result.success) {
      console.log('✅ Cancel function works!');
      
      // Verify the request was actually cancelled
      console.log('\n3️⃣ Verifying request was cancelled...');
      
      const { data: updatedRequest, error: verifyError } = await supabase
        .from('meeting_requests')
        .select('*')
        .eq('id', testRequest.id)
        .single();
      
      if (verifyError) {
        console.error('❌ Error verifying cancellation:', verifyError);
      } else {
        console.log('📋 Updated request status:', updatedRequest.status);
        if (updatedRequest.status === 'cancelled') {
          console.log('✅ Request successfully cancelled in database!');
        } else {
          console.log('❌ Request status was not updated to cancelled');
        }
      }
    } else {
      console.log('❌ Cancel function failed:', result?.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testCancelFunction();
