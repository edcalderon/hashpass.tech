#!/usr/bin/env node

/**
 * Quick Password Reset Script - Uses bcrypt instead of argon2
 * This works without additional dependencies since bcrypt is already installed
 */

const bcrypt = require('bcrypt');
const https = require('https');

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('❌ Missing ADMIN_EMAIL or ADMIN_PASSWORD environment variables');
  process.exit(1);
}

// Hash password with bcrypt (10 rounds)
const hashedPassword = bcrypt.hashSync(password, 10);

console.log('🔐 Resetting admin password...');
console.log(`📧 Email: ${email}`);
console.log(`🔒 Hashed: ${hashedPassword.substring(0, 20)}...`);
console.log('');
console.log('Run this SQL on your Directus database:');
console.log('');
console.log('----------------------------------------');
console.log(`UPDATE directus_users SET password = '${hashedPassword}' WHERE email = '${email}';`);
console.log('----------------------------------------');
console.log('');
console.log('Or use this direct database connection:');
console.log('');
const dbPass = process.env.DB_PASSWORD.replace(/'/g, "\\'");
console.log(`PGPASSWORD='${dbPass}' psql -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -c "UPDATE directus_users SET password = '${hashedPassword}' WHERE email = '${email}';"`);
