#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase environment variables:');
  console.error('- EXPO_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!serviceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  console.log('🔄 Starting agenda day refactoring...');
  
  try {
    // First, get all agenda items
    const { data: agendaItems, error: fetchError } = await supabase
      .from('event_agenda')
      .select('*')
      .eq('event_id', 'bsl2025')
      .order('time', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching agenda items:', fetchError);
      process.exit(1);
    }

    if (!agendaItems || agendaItems.length === 0) {
      console.log('❌ No agenda items found');
      process.exit(1);
    }

    console.log(`📋 Found ${agendaItems.length} agenda items`);

    // Group items by their current day values
    const dayGroups = {};
    agendaItems.forEach(item => {
      const currentDay = item.day;
      if (!dayGroups[currentDay]) {
        dayGroups[currentDay] = [];
      }
      dayGroups[currentDay].push(item);
    });

    console.log('\n📅 Current day distribution:');
    Object.entries(dayGroups).forEach(([day, items]) => {
      console.log(`  ${day || 'No day'}: ${items.length} items`);
    });

    // Create mapping from complex day names to simple numbers
    const dayMapping = {
      'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12': '1',
      'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13': '2', 
      'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14': '3'
    };

    // Update items with new simple day numbers
    let updateCount = 0;
    let errorCount = 0;

    for (const [currentDay, items] of Object.entries(dayGroups)) {
      let newDayValue = null;

      if (currentDay === null || currentDay === undefined) {
        // Items without day info - distribute them
        console.log(`\n📝 Distributing ${items.length} items without day info...`);
        
        // Distribute items without day info across the 3 days
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          const targetDay = ((index % 3) + 1).toString();
          
          const { error } = await supabase
            .from('event_agenda')
            .update({ day: targetDay })
            .eq('id', item.id);

          if (error) {
            console.error(`❌ Error updating ${item.id}:`, error.message);
            errorCount++;
          } else {
            console.log(`✅ Updated ${item.title} → Day ${targetDay}`);
            updateCount++;
          }
        }
      } else if (dayMapping[currentDay]) {
        // Items with complex day names
        newDayValue = dayMapping[currentDay];
        console.log(`\n📝 Updating ${items.length} items from "${currentDay}" → Day ${newDayValue}`);
        
        const { error } = await supabase
          .from('event_agenda')
          .update({ day: newDayValue })
          .eq('day', currentDay);

        if (error) {
          console.error(`❌ Error updating day ${currentDay}:`, error.message);
          errorCount += items.length;
        } else {
          console.log(`✅ Updated ${items.length} items to Day ${newDayValue}`);
          updateCount += items.length;
        }
      } else {
        console.log(`⚠️ Unknown day format: "${currentDay}" - skipping ${items.length} items`);
      }
    }

    console.log('\n📊 Refactoring Summary:');
    console.log(`✅ Successfully updated: ${updateCount} items`);
    console.log(`❌ Errors: ${errorCount} items`);

    // Verify the new distribution
    console.log('\n🔍 Verifying new distribution...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('event_agenda')
      .select('id, day, title, time')
      .eq('event_id', 'bsl2025')
      .order('day', { ascending: true })
      .order('time', { ascending: true });

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
    } else {
      const newDayDistribution = {};
      verifyData.forEach(item => {
        const day = item.day || 'No day';
        newDayDistribution[day] = (newDayDistribution[day] || 0) + 1;
      });
      
      console.log('\n📅 New day distribution:');
      Object.entries(newDayDistribution).forEach(([day, count]) => {
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
