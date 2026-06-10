/**
 * Reset Directus Admin Password
 * 
 * This script connects to the Directus database and resets the admin password.
 * It uses argon2 to hash the password, which is what Directus uses.
 * 
 * Usage:
 *   node scripts/reset-admin-password.js [email] [password]
 * 
 * Example:
 *   node scripts/reset-admin-password.js admin@hashpass.tech HashPass2024!
 */

const { Client } = require('pg');
const argon2 = require('argon2');

// Get credentials from command line or environment
const email = process.argv[2] || process.env.ADMIN_EMAIL;
const password = process.argv[3] || process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('❌ Missing required parameters');
  console.error('Usage: node scripts/reset-admin-password.js [email] [password]');
  console.error('Or set ADMIN_EMAIL and ADMIN_PASSWORD environment variables');
  process.exit(1);
}

// Database connection from environment
// Load .env file if not already loaded
if (!process.env.DB_HOST) {
  require('dotenv').config();
}

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD?.replace(/^"|"$/g, ''), // Remove surrounding quotes if present
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

async function resetAdminPassword() {
  console.log('🔐 Resetting Directus admin password...');
  console.log(`📧 Email: ${email}`);
  console.log(`🔒 Password: ${'*'.repeat(password.length)}`);
  console.log(`🗄️  Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  console.log('');

  const client = new Client(dbConfig);

  try {
    // Connect to database
    await client.connect();
    console.log('✅ Connected to database');

    // Hash the password using argon2 (same as Directus)
    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 3,
      parallelism: 1
    });
    console.log('✅ Password hashed');

    // Check if user exists
    const checkResult = await client.query(
      'SELECT id, email, first_name, last_name, role FROM directus_users WHERE email = $1',
      [email]
    );

    if (checkResult.rows.length === 0) {
      console.error(`❌ User with email ${email} not found in database`);
      console.log('\n💡 Available users:');
      const usersResult = await client.query(
        'SELECT id, email, first_name, last_name, role FROM directus_users ORDER BY email'
      );
      usersResult.rows.forEach(user => {
        console.log(`   - ${user.email} (${user.first_name} ${user.last_name}) - Role: ${user.role}`);
      });
      process.exit(1);
    }

    console.log(`✅ User found: ${checkResult.rows[0].first_name} ${checkResult.rows[0].last_name}`);

    // Update the password
    const updateResult = await client.query(
      'UPDATE directus_users SET password = $1 WHERE email = $2 RETURNING id, email',
      [hashedPassword, email]
    );

    if (updateResult.rowCount > 0) {
      console.log(`✅ Password updated successfully for ${updateResult.rows[0].email}`);
      console.log('');
      console.log('🎉 You can now login with:');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}`);
    } else {
      console.error('❌ Failed to update password');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Make sure the database is accessible and credentials are correct');
    } else if (error.code === '42P01') {
      console.error('💡 The directus_users table does not exist. Is Directus initialized?');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Check if required packages are installed
try {
  require.resolve('pg');
  require.resolve('argon2');
} catch (e) {
  console.error('❌ Missing required packages. Please install them:');
  console.error('   npm install pg argon2');
  process.exit(1);
}

// Run the script
resetAdminPassword().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
