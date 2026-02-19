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

async function createMeetingRequestsToAllActiveSpeakers() {
  try {
    console.log('🚀 Creating meeting requests from Edward Calderon to all active speakers...\n');
    
    // Edward Calderon user ID (requester)
    const edwardUserId = 'd4b211d8-0336-43c3-aac3-cfe629a590ba';
    
    // Get all active speakers (those with user_id linked)
    console.log('📋 Fetching all active speakers...');
    const { data: activeSpeakers, error: speakersError } = await supabase
      .from('bsl_speakers')
      .select('id, name, user_id')
      .not('user_id', 'is', null)
      .order('name');
    
    if (speakersError) {
      console.error('❌ Error fetching speakers:', speakersError);
      process.exit(1);
    }
    
    if (!activeSpeakers || activeSpeakers.length === 0) {
      console.error('❌ No active speakers found');
      process.exit(1);
    }
    
    console.log(`✅ Found ${activeSpeakers.length} active speakers\n`);
    
    // Filter out Edward Calderon himself (don't send request to himself)
    const otherSpeakers = activeSpeakers.filter(s => s.user_id !== edwardUserId);
    
    console.log(`📤 Sending requests to ${otherSpeakers.length} speakers (excluding Edward Calderon)\n`);
    console.log('='.repeat(60));
    
    let successCount = 0;
    let failCount = 0;
    const failedSpeakers = [];
    
    // Create meeting request for each speaker
    for (const speaker of otherSpeakers) {
      try {
        console.log(`\n📧 Sending to: ${speaker.name} (${speaker.id})`);
        
        const { data, error } = await supabase.rpc('insert_meeting_request', {
          p_requester_id: edwardUserId,
          p_speaker_id: speaker.id,
          p_speaker_name: speaker.name,
          p_requester_name: 'Edward Calderon',
          p_requester_company: null,
          p_requester_title: null,
          p_requester_ticket_type: 'vip',
          p_meeting_type: 'networking',
          p_message: `Hola ${speaker.name.split(' ')[0]}, me gustaría coordinar una reunión para el coctel de hoy a las 7:30 PM en Hash House.`,
          p_note: 'Coctel - Hash House - 7:30 PM',
          p_boost_amount: 0,
          p_duration_minutes: 30,
          p_expires_at: null
        });
        
        if (error) {
          console.error(`   ❌ Error: ${error.message}`);
          failCount++;
          failedSpeakers.push({ name: speaker.name, error: error.message });
          continue;
        }
        
        if (data && data.success === false) {
          console.error(`   ❌ Failed: ${data.message || data.error}`);
          failCount++;
          failedSpeakers.push({ name: speaker.name, error: data.message || data.error });
          continue;
        }
        
        console.log(`   ✅ Request created successfully`);
        console.log(`      Request ID: ${data?.request_id || data?.id || 'N/A'}`);
        successCount++;
        
        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`   💥 Exception: ${error.message}`);
        failCount++;
        failedSpeakers.push({ name: speaker.name, error: error.message });
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total active speakers: ${activeSpeakers.length}`);
    console.log(`Speakers to contact: ${otherSpeakers.length}`);
    console.log(`✅ Successfully sent: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    
    if (failedSpeakers.length > 0) {
      console.log('\n❌ Failed requests:');
      failedSpeakers.forEach(({ name, error }) => {
        console.log(`   - ${name}: ${error}`);
      });
    }
    
    console.log('='.repeat(60));
    
    // Verify some requests were created
    console.log('\n🔍 Verifying requests...');
    const { data: requests, error: verifyError } = await supabase
      .from('meeting_requests')
      .select('id, speaker_name, status, created_at')
      .eq('requester_id', edwardUserId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (verifyError) {
      console.warn('⚠️  Could not verify requests:', verifyError.message);
    } else {
      console.log(`✅ Found ${requests?.length || 0} recent requests from Edward Calderon`);
      if (requests && requests.length > 0) {
        console.log('\nRecent requests:');
        requests.slice(0, 5).forEach(req => {
          console.log(`   - ${req.speaker_name}: ${req.status} (${req.created_at})`);
        });
      }
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

createMeetingRequestsToAllActiveSpeakers();

