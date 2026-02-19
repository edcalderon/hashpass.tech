#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeCompleteFix() {
  try {
    console.log('🔧 Executing complete fix for meeting request system...');
    
    // Read the SQL file
    const sql = fs.readFileSync('scripts/sql/complete-fix-all-issues.sql', 'utf8');
    
    // Split into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    console.log(`📋 Found ${statements.length} SQL statements to execute`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement.length === 0) continue;
      
      console.log(`\n🔧 Executing statement ${i + 1}/${statements.length}...`);
      console.log(`   ${statement.substring(0, 100)}...`);
      
      try {
        // Try to execute using the REST API
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          },
          body: JSON.stringify({ sql: statement })
        });
        
        if (response.ok) {
          console.log('   ✅ Success');
        } else {
          const error = await response.text();
          console.log('   ❌ Error:', error);
        }
      } catch (err) {
        console.log('   ❌ Exception:', err.message);
      }
    }
    
    console.log('\n🧪 Testing the fixed system...');
    
    // Test the system
    const { data: testResult, error: testError } = await supabase
      .rpc('test_meeting_request_system');
    
    if (testError) {
      console.log('❌ Test failed:', testError.message);
    } else {
      console.log('✅ Test passed:', testResult);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

executeCompleteFix();
