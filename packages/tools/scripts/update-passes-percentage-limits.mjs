#!/usr/bin/env node
/**
 * Script to update existing passes with new percentage-based limits
 * General: 25% of total speakers
 * Business: 63% of total speakers
 * VIP: 101% of total speakers
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Please ensure EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function updateExistingPasses() {
  console.log('🔄 Updating existing passes with percentage-based limits...\n');

  try {
    // Step 1: Count total speakers
    console.log('📊 Counting total speakers...');
    const { data: speakers, error: speakersError, count: speakerCount } = await supabase
      .from('bsl_speakers')
      .select('*', { count: 'exact', head: true });

    if (speakersError) {
      throw new Error(`Failed to count speakers: ${speakersError.message}`);
    }

    const totalSpeakers = speakerCount || 0;
    console.log(`✅ Found ${totalSpeakers} total speakers\n`);

    if (totalSpeakers === 0) {
      console.warn('⚠️  No speakers found. Cannot calculate limits.');
      return;
    }

    // Step 2: Calculate limits
    const generalLimit = Math.ceil(totalSpeakers * 0.25);  // 25%
    const businessLimit = Math.ceil(totalSpeakers * 0.63);  // 63%
    const vipLimit = Math.ceil(totalSpeakers * 1.01);  // 101%

    console.log('📐 Calculated limits:');
    console.log(`   General: ${generalLimit} requests ($${generalLimit * 20} boost)`);
    console.log(`   Business: ${businessLimit} requests ($${businessLimit * 20} boost)`);
    console.log(`   VIP: ${vipLimit} requests ($${vipLimit * 20} boost)\n`);

    // Step 3: Get current pass counts
    const { data: passes, error: passesError } = await supabase
      .from('passes')
      .select('id, pass_type, max_meeting_requests, max_boost_amount')
      .eq('event_id', 'bsl2025');

    if (passesError) {
      throw new Error(`Failed to fetch passes: ${passesError.message}`);
    }

    if (!passes || passes.length === 0) {
      console.log('ℹ️  No passes found to update.');
      return;
    }

    console.log(`📋 Found ${passes.length} passes to update\n`);

    // Step 4: Update passes by type
    const updates = {
      general: { count: 0, limit: generalLimit },
      business: { count: 0, limit: businessLimit },
      vip: { count: 0, limit: vipLimit },
    };

    // Count passes by type
    passes.forEach(pass => {
      if (pass.pass_type === 'general') updates.general.count++;
      else if (pass.pass_type === 'business') updates.business.count++;
      else if (pass.pass_type === 'vip') updates.vip.count++;
    });

    // Update General passes
    if (updates.general.count > 0) {
      console.log(`🔄 Updating ${updates.general.count} General passes...`);
      const { error: generalError } = await supabase
        .from('passes')
        .update({
          max_meeting_requests: generalLimit,
          max_boost_amount: generalLimit * 20,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', 'bsl2025')
        .eq('pass_type', 'general');

      if (generalError) {
        throw new Error(`Failed to update General passes: ${generalError.message}`);
      }
      console.log(`✅ Updated ${updates.general.count} General passes\n`);
    }

    // Update Business passes
    if (updates.business.count > 0) {
      console.log(`🔄 Updating ${updates.business.count} Business passes...`);
      const { error: businessError } = await supabase
        .from('passes')
        .update({
          max_meeting_requests: businessLimit,
          max_boost_amount: businessLimit * 20,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', 'bsl2025')
        .eq('pass_type', 'business');

      if (businessError) {
        throw new Error(`Failed to update Business passes: ${businessError.message}`);
      }
      console.log(`✅ Updated ${updates.business.count} Business passes\n`);
    }

    // Update VIP passes
    if (updates.vip.count > 0) {
      console.log(`🔄 Updating ${updates.vip.count} VIP passes...`);
      const { error: vipError } = await supabase
        .from('passes')
        .update({
          max_meeting_requests: vipLimit,
          max_boost_amount: vipLimit * 20,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', 'bsl2025')
        .eq('pass_type', 'vip');

      if (vipError) {
        throw new Error(`Failed to update VIP passes: ${vipError.message}`);
      }
      console.log(`✅ Updated ${updates.vip.count} VIP passes\n`);
    }

    // Step 5: Summary
    console.log('📊 Update Summary:');
    console.log(`   Total speakers: ${totalSpeakers}`);
    console.log(`   General passes: ${updates.general.count} (${generalLimit} requests, $${generalLimit * 20} boost)`);
    console.log(`   Business passes: ${updates.business.count} (${businessLimit} requests, $${businessLimit * 20} boost)`);
    console.log(`   VIP passes: ${updates.vip.count} (${vipLimit} requests, $${vipLimit * 20} boost)`);
    console.log(`\n✅ Successfully updated ${passes.length} passes!\n`);

  } catch (error) {
    console.error('❌ Error updating passes:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the update
updateExistingPasses();


