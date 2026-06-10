#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  console.log('🔧 Fixing remaining items without day info...');
  
  try {
    // Get items without day info
    const { data: itemsWithoutDay, error: fetchError } = await supabase
      .from('event_agenda')
      .select('*')
      .eq('event_id', 'bsl2025')
      .is('day', null)
      .order('time', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching items:', fetchError);
      process.exit(1);
    }

    if (!itemsWithoutDay || itemsWithoutDay.length === 0) {
      console.log('✅ No items without day info found');
      return;
    }

    console.log(`📋 Found ${itemsWithoutDay.length} items without day info`);

    // Distribute items across the 3 days
    let updateCount = 0;
    let errorCount = 0;

    for (let index = 0; index < itemsWithoutDay.length; index++) {
      const item = itemsWithoutDay[index];
      const targetDay = ((index % 3) + 1).toString();
      
      const { error } = await supabase
        .from('event_agenda')
        .update({ day: targetDay })
        .eq('id', item.id);

      if (error) {
        console.error(`❌ Error updating ${item.id}:`, error.message);
        errorCount++;
      } else {
        console.log(`✅ Updated "${item.title}" → Day ${targetDay}`);
        updateCount++;
      }
    }

    console.log('\n📊 Fix Summary:');
    console.log(`✅ Successfully updated: ${updateCount} items`);
    console.log(`❌ Errors: ${errorCount} items`);

    // Verify final distribution
    console.log('\n🔍 Verifying final distribution...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('event_agenda')
      .select('id, day, title, time')
      .eq('event_id', 'bsl2025')
      .order('day', { ascending: true })
      .order('time', { ascending: true });

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
    } else {
      const finalDistribution = {};
      verifyData.forEach(item => {
        const day = item.day || 'No day';
        finalDistribution[day] = (finalDistribution[day] || 0) + 1;
      });
      
      console.log('\n📅 Final day distribution:');
      Object.entries(finalDistribution).forEach(([day, count]) => {
        console.log(`  Day ${day}: ${count} items`);
      });
      
      console.log(`\n✅ Total items: ${verifyData.length}`);
    }

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main().catch((e) => { 
  console.error('💥 Fatal error:', e); 
  process.exit(1); 
});
