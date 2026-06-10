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
  console.log('🔧 Executing SQL to add day_name column...');
  
  try {
    // Execute the SQL to add the column
    const sql = `
      ALTER TABLE public.event_agenda ADD COLUMN IF NOT EXISTS day_name TEXT;
      COMMENT ON COLUMN public.event_agenda.day_name IS 'Thematic name for the day';
      CREATE INDEX IF NOT EXISTS idx_event_agenda_day_name ON public.event_agenda(day_name);
    `;

    console.log('📝 Executing SQL...');
    const { data, error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      console.log('⚠️ RPC method not available, trying alternative approach...');
      
      // Alternative: Try to test if column exists by selecting from it
      const { data: testData, error: testError } = await supabase
        .from('event_agenda')
        .select('day_name')
        .limit(1);

      if (testError && testError.code === '42703') {
        console.log('❌ Column day_name does not exist yet.');
        console.log('\n📋 Please run this SQL manually in your Supabase SQL Editor:');
        console.log('```sql');
        console.log('ALTER TABLE public.event_agenda ADD COLUMN IF NOT EXISTS day_name TEXT;');
        console.log('COMMENT ON COLUMN public.event_agenda.day_name IS \'Thematic name for the day\';');
        console.log('CREATE INDEX IF NOT EXISTS idx_event_agenda_day_name ON public.event_agenda(day_name);');
        console.log('```');
        console.log('\n🔄 After running the SQL, run the data population script.');
        return;
      }

      if (testError) {
        console.error('❌ Error testing column:', testError);
        return;
      }

      console.log('✅ Column day_name already exists!');
    } else {
      console.log('✅ SQL executed successfully!');
    }

    // Now populate the data
    console.log('\n🏷️ Populating day names...');
    
    const dayNameMappings = {
      '1': 'Regulación, Bancos Centrales e Infraestructura del Dinero Digital',
      '2': 'PSAV, Compliance, Custodia y Tokenización', 
      '3': 'Stablecoins y DeFi: Integrando el Mundo Financiero Global'
    };

    // Get all agenda items
    const { data: agendaItems, error: fetchError } = await supabase
      .from('event_agenda')
      .select('*')
      .eq('event_id', 'bsl2025')
      .order('day', { ascending: true })
      .order('time', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching agenda items:', fetchError);
      process.exit(1);
    }

    console.log(`📋 Found ${agendaItems.length} agenda items`);

    // Update items with day names
    let updateCount = 0;
    let errorCount = 0;

    for (const item of agendaItems) {
      const dayNumber = item.day;
      const dayName = dayNameMappings[dayNumber];

      if (dayName) {
        const { error } = await supabase
          .from('event_agenda')
          .update({ day_name: dayName })
          .eq('id', item.id);

        if (error) {
          console.error(`❌ Error updating ${item.id}:`, error.message);
          errorCount++;
        } else {
          console.log(`✅ Updated Day ${dayNumber}: "${item.title}" → "${dayName}"`);
          updateCount++;
        }
      } else if (dayNumber === null || dayNumber === undefined) {
        // Handle items without day - assign them to day 1 for now
        const { error } = await supabase
          .from('event_agenda')
          .update({ 
            day: '1',
            day_name: dayNameMappings['1']
          })
          .eq('id', item.id);

        if (error) {
          console.error(`❌ Error updating ${item.id}:`, error.message);
          errorCount++;
        } else {
          console.log(`✅ Updated null day: "${item.title}" → Day 1`);
          updateCount++;
        }
      } else {
        console.log(`⚠️ No day name mapping for day ${dayNumber}: "${item.title}"`);
      }
    }

    console.log('\n📊 Update Summary:');
    console.log(`✅ Successfully updated: ${updateCount} items`);
    console.log(`❌ Errors: ${errorCount} items`);

    // Verify the updates
    console.log('\n🔍 Verifying final structure...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('event_agenda')
      .select('id, day, day_name, title, time')
      .eq('event_id', 'bsl2025')
      .order('day', { ascending: true })
      .order('time', { ascending: true });

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
    } else {
      const dayGroups = {};
      verifyData.forEach(item => {
        const day = item.day || 'No day';
        if (!dayGroups[day]) {
          dayGroups[day] = {
            count: 0,
            name: item.day_name || 'No name',
            items: []
          };
        }
        dayGroups[day].count++;
        dayGroups[day].items.push(item.title);
      });
      
      console.log('\n📅 Final structure:');
      Object.entries(dayGroups).forEach(([day, info]) => {
        console.log(`\n  Day ${day}: ${info.name}`);
        console.log(`    Count: ${info.count} items`);
        console.log(`    Sample: ${info.items[0]}`);
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
