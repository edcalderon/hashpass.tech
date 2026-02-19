import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Please ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTableAndPasses() {
  console.log('🎫 Creating passes table and adding Edward Calderon passes...');
  
  const userId = 'edward-calderon-unal';
  const userEmail = 'ecalderon@unal.edu.co';
  const eventId = 'bsl2025';
  
  try {
    // First, let's try to create the table using a simple approach
    console.log('🏗️ Attempting to create passes table...');
    
    // Try to insert a test record to see if table exists
    const testPass = {
      id: 'test-pass-creation',
      user_id: 'test-user',
      event_id: 'test-event',
      pass_type: 'general',
      status: 'active',
      purchase_date: new Date().toISOString(),
      price_usd: 0.00,
      access_features: []
    };
    
    const { error: testError } = await supabase
      .from('passes')
      .insert(testPass);
    
    if (testError) {
      if (testError.message.includes('does not exist')) {
        console.log('❌ Passes table does not exist');
        console.log('\n📋 Please run this SQL in your Supabase SQL Editor:');
        console.log('```sql');
        console.log(`-- Create passes table
CREATE TABLE IF NOT EXISTS public.passes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    pass_type TEXT NOT NULL CHECK (pass_type IN ('general', 'vip', 'business')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
    purchase_date TIMESTAMPTZ DEFAULT NOW(),
    price_usd DECIMAL(10,2),
    access_features TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_passes_user_id ON public.passes(user_id);
CREATE INDEX IF NOT EXISTS idx_passes_event_id ON public.passes(event_id);
CREATE INDEX IF NOT EXISTS idx_passes_pass_type ON public.passes(pass_type);
CREATE INDEX IF NOT EXISTS idx_passes_status ON public.passes(status);

-- Enable RLS
ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own passes" ON public.passes
    FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert their own passes" ON public.passes
    FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update their own passes" ON public.passes
    FOR UPDATE USING (user_id = auth.uid()::text);`);
        console.log('```');
        console.log('\n🔄 After creating the table, run this script again.');
        return;
      } else {
        console.error('❌ Error testing table:', testError.message);
        return;
      }
    }
    
    // If we get here, the table exists, so delete the test record
    await supabase
      .from('passes')
      .delete()
      .eq('id', 'test-pass-creation');
    
    console.log('✅ Passes table exists');
    
    // Now create Edward's passes
    console.log('📝 Creating Edward Calderon\'s passes...');
    
    const passes = [
      {
        id: `${userId}-general-${Date.now()}`,
        user_id: userId,
        event_id: eventId,
        pass_type: 'general',
        status: 'active',
        purchase_date: new Date().toISOString(),
        price_usd: 99.00,
        access_features: [
          'All conferences (Nov 12-14)',
          'Booth area access',
          'Networking sessions'
        ]
      },
      {
        id: `${userId}-business-${Date.now()}`,
        user_id: userId,
        event_id: eventId,
        pass_type: 'business',
        status: 'active',
        purchase_date: new Date().toISOString(),
        price_usd: 249.00,
        access_features: [
          'All conferences (Nov 12-14)',
          'Booth area access',
          'Exclusive networking zone (B2B speed dating)',
          'Official closing party (Nov 14)'
        ]
      },
      {
        id: `${userId}-vip-${Date.now()}`,
        user_id: userId,
        event_id: eventId,
        pass_type: 'vip',
        status: 'active',
        purchase_date: new Date().toISOString(),
        price_usd: 499.00,
        access_features: [
          'All conferences (Nov 12-14)',
          'Booth area access',
          'Exclusive networking zone (B2B speed dating)',
          'Welcome cocktail (Nov 12)',
          'VIP area access (exclusive networking with speakers, sponsors, authorities)',
          'Official closing party (Nov 14)'
        ]
      }
    ];
    
    const { data: insertedPasses, error: insertError } = await supabase
      .from('passes')
      .insert(passes)
      .select();
    
    if (insertError) {
      console.error('❌ Error inserting passes:', insertError.message);
      return;
    }
    
    console.log('✅ Successfully created Edward Calderon\'s passes:');
    console.log(`👤 User: ${userId} (${userEmail})`);
    console.log(`🎫 Event: ${eventId}`);
    console.log(`📊 Total passes: ${insertedPasses.length}`);
    
    insertedPasses.forEach((pass, index) => {
      console.log(`\n🎫 Pass ${index + 1}:`);
      console.log(`   Type: ${pass.pass_type.toUpperCase()}`);
      console.log(`   Price: $${pass.price_usd}`);
      console.log(`   Status: ${pass.status}`);
      console.log(`   Features: ${pass.access_features.length} access features`);
      console.log(`   ID: ${pass.id}`);
    });
    
    console.log('\n🎉 Setup complete!');
    console.log('📱 The explorer view should now display Edward Calderon\'s passes');
    console.log('🔗 Test URL: http://localhost:3000/api/bslatam/user-passes?userId=edward-calderon-unal&eventId=bsl2025');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run the script
createTableAndPasses();
