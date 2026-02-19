#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createMeetingRequest() {
  try {
    console.log('🚀 Creating meeting request between Rodrigo Sainz and Claudia Restrepo...\n');
    
    // User IDs
    const rodrigoUserId = 'c076f94e-b37c-47f2-8012-83c49bb30d4a'; // Rodrigo Sainz (requester)
    const claudiaSpeakerId = '4485d3cd-fc5d-5fac-82bb-b3eb03d3b129'; // Claudia Restrepo (speaker)
    
    // Check if Claudia has a user_id linked
    const { data: claudiaSpeaker, error: speakerError } = await supabase
      .from('bsl_speakers')
      .select('id, name, user_id')
      .eq('id', claudiaSpeakerId)
      .single();
    
    if (speakerError) {
      console.error('❌ Error fetching speaker:', speakerError);
      process.exit(1);
    }
    
    if (!claudiaSpeaker.user_id) {
      console.warn('⚠️  Warning: Claudia Restrepo does not have a user_id linked.');
      console.warn('   Meeting requests require the speaker to have a user account.');
      console.warn('   The request may fail. Attempting anyway...\n');
    }
    
    console.log(`📅 Meeting time: Today`);
    console.log(`👤 Requester: Rodrigo Sainz (${rodrigoUserId})`);
    console.log(`🎤 Speaker: Claudia Restrepo (${claudiaSpeakerId})`);
    if (claudiaSpeaker.user_id) {
      console.log(`   Speaker user_id: ${claudiaSpeaker.user_id}\n`);
    } else {
      console.log(`   Speaker user_id: NOT LINKED\n`);
    }
    
    // Create meeting request using the RPC function
    const { data, error } = await supabase.rpc('insert_meeting_request', {
      p_requester_id: rodrigoUserId,
      p_speaker_id: claudiaSpeakerId,
      p_speaker_name: 'Claudia Restrepo',
      p_requester_name: 'Rodrigo Sainz',
      p_requester_company: null,
      p_requester_title: null,
      p_requester_ticket_type: 'vip', // Rodrigo has VIP pass
      p_meeting_type: 'networking',
      p_message: `Hola Claudia, me gustaría coordinar una reunión contigo.`,
      p_note: null,
      p_boost_amount: 0,
      p_duration_minutes: 15,
      p_expires_at: null // Use default (7 days)
    });
    
    if (error) {
      console.error('❌ Error creating meeting request:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      if (error.message && error.message.includes('not linked to user')) {
        console.error('\n💡 Solution: Claudia Restrepo needs to be linked to a user account first.');
        console.error('   You can run the match-users-to-speakers script to link her.');
      }
      
      process.exit(1);
    }
    
    if (data && data.success === false) {
      console.error('❌ Meeting request creation failed:', data.message || data.error);
      
      if (data.message && data.message.includes('not linked to user')) {
        console.error('\n💡 Solution: Claudia Restrepo needs to be linked to a user account first.');
        console.error('   You can run the match-users-to-speakers script to link her.');
      }
      
      process.exit(1);
    }
    
    console.log('✅ Meeting request created successfully!');
    console.log('\n📋 Request Details:');
    console.log(`   Request ID: ${data?.request_id || data?.id || 'N/A'}`);
    console.log(`   Status: pending`);
    console.log(`   Meeting Type: networking`);
    console.log(`   Duration: 15 minutes`);
    
    // Verify the request was created
    console.log('\n🔍 Verifying request...');
    const { data: requestData, error: fetchError } = await supabase
      .from('meeting_requests')
      .select('*')
      .eq('requester_id', rodrigoUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (fetchError) {
      console.warn('⚠️  Could not verify request:', fetchError.message);
    } else {
      console.log('✅ Request verified in database');
      console.log(`   Request ID: ${requestData.id}`);
      console.log(`   Status: ${requestData.status}`);
      console.log(`   Speaker: ${requestData.speaker_name}`);
      console.log(`   Created: ${requestData.created_at}`);
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

createMeetingRequest();

