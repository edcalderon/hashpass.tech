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
    console.log('🚀 Creating meeting request between Edward Calderon and Mercedes Bidart...\n');
    
    // User IDs
    const edwardUserId = 'd4b211d8-0336-43c3-aac3-cfe629a590ba'; // Edward Calderon (requester)
    const mercedesSpeakerId = 'ca0cb0fb-3273-5171-8399-e921663e93fc'; // Mercedes Bidart (speaker)
    
    // Get today's date and set time to 7:30 PM (19:30)
    const today = new Date();
    today.setHours(19, 30, 0, 0); // 7:30 PM
    
    // Format as ISO string for PostgreSQL
    const meetingTime = today.toISOString();
    
    console.log(`📅 Meeting time: ${meetingTime}`);
    console.log(`📍 Location: Hash House`);
    console.log(`👤 Requester: Edward Calderon`);
    console.log(`🎤 Speaker: Mercedes Bidart\n`);
    
    // Create meeting request using the RPC function
    const { data, error } = await supabase.rpc('insert_meeting_request', {
      p_requester_id: edwardUserId,
      p_speaker_id: mercedesSpeakerId,
      p_speaker_name: 'Mercedes Bidart',
      p_requester_name: 'Edward Calderon',
      p_requester_company: null,
      p_requester_title: null,
      p_requester_ticket_type: 'vip', // Both have VIP passes
      p_meeting_type: 'networking', // Cocktail/networking meeting
      p_message: `Hola Mercedes, me gustaría coordinar una reunión para el coctel de hoy a las 7:30 PM en Hash House.`,
      p_note: 'Coctel - Hash House - 7:30 PM',
      p_boost_amount: 0,
      p_duration_minutes: 30, // 30 minutes for a cocktail meeting
      p_expires_at: null // Use default (7 days)
    });
    
    if (error) {
      console.error('❌ Error creating meeting request:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      process.exit(1);
    }
    
    if (data && data.success === false) {
      console.error('❌ Meeting request creation failed:', data.message || data.error);
      process.exit(1);
    }
    
    console.log('✅ Meeting request created successfully!');
    console.log('\n📋 Request Details:');
    console.log(`   Request ID: ${data?.request_id || data?.id || 'N/A'}`);
    console.log(`   Status: pending`);
    console.log(`   Meeting Type: coctel`);
    console.log(`   Location: Hash House`);
    console.log(`   Time: Today at 7:30 PM`);
    console.log(`   Duration: 30 minutes`);
    
    // Verify the request was created
    console.log('\n🔍 Verifying request...');
    const { data: requestData, error: fetchError } = await supabase
      .from('meeting_requests')
      .select('*')
      .eq('requester_id', edwardUserId)
      .eq('speaker_id', 'ae5c1e7c-ee58-482c-bc4d-097f648538c6') // Mercedes user_id
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (fetchError) {
      console.warn('⚠️  Could not verify request:', fetchError.message);
    } else {
      console.log('✅ Request verified in database');
      console.log(`   Request ID: ${requestData.id}`);
      console.log(`   Status: ${requestData.status}`);
      console.log(`   Created: ${requestData.created_at}`);
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

createMeetingRequest();

