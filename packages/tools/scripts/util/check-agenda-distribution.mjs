import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAgendaDistribution() {
  try {
    console.log('🔍 Checking agenda distribution in database...\n');

    // Fetch all agenda items for BSL 2025
    const { data, error } = await supabase
      .from('event_agenda')
      .select('*')
      .eq('event_id', 'bsl2025')
      .order('time', { ascending: true });

    if (error) {
      console.error('❌ Error fetching agenda:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log('📭 No agenda data found in database');
      return;
    }

    console.log(`📊 Total agenda items: ${data.length}\n`);

    // Group by day
    const dayGroups = {};
    data.forEach(item => {
      const day = item.day || 'No day specified';
      if (!dayGroups[day]) {
        dayGroups[day] = [];
      }
      dayGroups[day].push(item);
    });

    // Display distribution
    console.log('📅 Day Distribution:');
    Object.keys(dayGroups).sort().forEach(day => {
      const items = dayGroups[day];
      console.log(`  ${day}: ${items.length} sessions`);
      
      // Show first few items for each day
      items.slice(0, 3).forEach(item => {
        console.log(`    - ${item.time} | ${item.title} | ${item.type}`);
      });
      if (items.length > 3) {
        console.log(`    ... and ${items.length - 3} more`);
      }
      console.log('');
    });

    // Check if distribution matches expected (12, 11, 12)
    const expectedDistribution = { '1': 12, '2': 11, '3': 12 };
    const actualDistribution = {};
    
    Object.keys(dayGroups).forEach(day => {
      if (day === '1' || day === '2' || day === '3') {
        actualDistribution[day] = dayGroups[day].length;
      }
    });

    console.log('🎯 Expected vs Actual Distribution:');
    console.log('  Day 1: Expected 12, Actual', actualDistribution['1'] || 0);
    console.log('  Day 2: Expected 11, Actual', actualDistribution['2'] || 0);
    console.log('  Day 3: Expected 12, Actual', actualDistribution['3'] || 0);

    // Check for issues
    const issues = [];
    if (actualDistribution['1'] !== 12) {
      issues.push(`Day 1 has ${actualDistribution['1'] || 0} sessions, expected 12`);
    }
    if (actualDistribution['2'] !== 11) {
      issues.push(`Day 2 has ${actualDistribution['2'] || 0} sessions, expected 11`);
    }
    if (actualDistribution['3'] !== 12) {
      issues.push(`Day 3 has ${actualDistribution['3'] || 0} sessions, expected 12`);
    }

    if (issues.length > 0) {
      console.log('\n⚠️  Issues found:');
      issues.forEach(issue => console.log(`  - ${issue}`));
    } else {
      console.log('\n✅ Distribution looks correct!');
    }

    // Show items without day information
    const itemsWithoutDay = data.filter(item => !item.day);
    if (itemsWithoutDay.length > 0) {
      console.log(`\n📝 Items without day information: ${itemsWithoutDay.length}`);
      itemsWithoutDay.forEach(item => {
        console.log(`  - ${item.time} | ${item.title} | ${item.type}`);
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkAgendaDistribution();
