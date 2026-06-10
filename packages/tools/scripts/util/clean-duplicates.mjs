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
  console.log('🧹 Cleaning up duplicate agenda items...');
  
  try {
    // Get all agenda items
    const { data: agendaItems, error: fetchError } = await supabase
      .from('event_agenda')
      .select('*')
      .eq('event_id', 'bsl2025')
      .order('time', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching agenda items:', fetchError);
      process.exit(1);
    }

    console.log(`📋 Found ${agendaItems.length} agenda items`);

    // Find duplicates by title and time
    const duplicates = {};
    agendaItems.forEach(item => {
      const key = `${item.title}|${item.time}`;
      if (!duplicates[key]) {
        duplicates[key] = [];
      }
      duplicates[key].push(item);
    });

    // Identify items to remove
    const itemsToRemove = [];
    Object.entries(duplicates).forEach(([key, items]) => {
      if (items.length > 1) {
        console.log(`\n🔍 Found ${items.length} duplicates for: "${key}"`);
        
        // Keep the item with proper day assignment, remove others
        const itemsWithDay = items.filter(item => item.day !== null && item.day !== undefined);
        const itemsWithoutDay = items.filter(item => item.day === null || item.day === undefined);
        
        if (itemsWithDay.length > 0) {
          console.log(`✅ Keeping ${itemsWithDay.length} items with day assignments:`, itemsWithDay.map(i => `ID: ${i.id} (Day ${i.day})`));
          console.log(`❌ Removing ${itemsWithoutDay.length} items without day assignments:`, itemsWithoutDay.map(i => `ID: ${i.id}`));
          itemsToRemove.push(...itemsWithoutDay);
        } else {
          // If no items have day assignments, keep the first one and remove the rest
          console.log(`✅ Keeping first item: ID ${items[0].id}`);
          console.log(`❌ Removing ${items.length - 1} duplicates:`, items.slice(1).map(i => `ID: ${i.id}`));
          itemsToRemove.push(...items.slice(1));
        }
      }
    });

    if (itemsToRemove.length === 0) {
      console.log('✅ No duplicates found!');
      return;
    }

    console.log(`\n🗑️ Removing ${itemsToRemove.length} duplicate items...`);
    
    let removedCount = 0;
    let errorCount = 0;

    for (const item of itemsToRemove) {
      const { error } = await supabase
        .from('event_agenda')
        .delete()
        .eq('id', item.id);

      if (error) {
        console.error(`❌ Error removing ${item.id}:`, error.message);
        errorCount++;
      } else {
        console.log(`✅ Removed duplicate: "${item.title}" (ID: ${item.id})`);
        removedCount++;
      }
    }

    console.log('\n📊 Cleanup Summary:');
    console.log(`✅ Successfully removed: ${removedCount} duplicates`);
    console.log(`❌ Errors: ${errorCount} items`);

    // Verify the cleanup
    console.log('\n🔍 Verifying cleanup...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('event_agenda')
      .select('id, day, title, time')
      .eq('event_id', 'bsl2025')
      .order('day', { ascending: true })
      .order('time', { ascending: true });

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
    } else {
      const dayDistribution = {};
      verifyData.forEach(item => {
        const day = item.day || 'No day';
        dayDistribution[day] = (dayDistribution[day] || 0) + 1;
      });
      
      console.log('\n📅 Final distribution:');
      Object.entries(dayDistribution).forEach(([day, count]) => {
        console.log(`  Day ${day}: ${count} items`);
      });
      
      console.log(`\n✅ Total items after cleanup: ${verifyData.length}`);
      
      // Check for remaining duplicates
      const remainingDuplicates = {};
      verifyData.forEach(item => {
        const key = `${item.title}|${item.time}`;
        if (!remainingDuplicates[key]) {
          remainingDuplicates[key] = [];
        }
        remainingDuplicates[key].push(item);
      });
      
      const stillDuplicated = Object.entries(remainingDuplicates).filter(([key, items]) => items.length > 1);
      if (stillDuplicated.length > 0) {
        console.log('\n⚠️ Still have duplicates:');
        stillDuplicated.forEach(([key, items]) => {
          console.log(`  "${key}": ${items.length} items`);
        });
      } else {
        console.log('\n✅ No remaining duplicates found!');
      }
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
