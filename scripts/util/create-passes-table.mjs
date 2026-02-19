import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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

async function createPassesTable() {
  console.log('🏗️ Creating passes table...');
  
  try {
    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20250115000009_passes.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL loaded from:', migrationPath);
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`\n🔧 Executing statement ${i + 1}/${statements.length}:`);
      console.log(statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          console.warn(`⚠️ Statement ${i + 1} failed (might already exist):`, error.message);
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (e) {
        console.warn(`⚠️ Statement ${i + 1} failed:`, e.message);
      }
    }
    
    // Verify the table was created
    console.log('\n🔍 Verifying passes table creation...');
    const { data, error } = await supabase
      .from('passes')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Passes table verification failed:', error.message);
      console.log('\n📋 Please run this SQL manually in your Supabase SQL Editor:');
      console.log('```sql');
      console.log(migrationSQL);
      console.log('```');
    } else {
      console.log('✅ Passes table created successfully!');
      console.log('📊 Table is ready for use');
    }
    
  } catch (error) {
    console.error('❌ Error creating passes table:', error.message);
    console.log('\n📋 Please run this SQL manually in your Supabase SQL Editor:');
    
    try {
      const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20250115000009_passes.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      console.log('```sql');
      console.log(migrationSQL);
      console.log('```');
    } catch (e) {
      console.log('Could not read migration file');
    }
  }
}

// Run the script
createPassesTable();
