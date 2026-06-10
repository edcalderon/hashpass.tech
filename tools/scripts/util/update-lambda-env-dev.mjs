import { execSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';

// Get current config
const configRaw = execSync('aws lambda get-function-configuration --function-name hashpass-dev-expo-router-api --region us-east-1').toString();
const config = JSON.parse(configRaw);
const currentVars = config.Environment?.Variables || {};

// Read .env
const envStr = fs.readFileSync('.env', 'utf-8');
const envParsed = dotenv.parse(envStr);

const newVars = {
    ...currentVars,
    GOOGLE_CLIENT_ID: envParsed.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: envParsed.GOOGLE_CLIENT_SECRET,
    ADMIN_EMAIL: envParsed.ADMIN_EMAIL,
    ADMIN_PASSWORD: envParsed.ADMIN_PASSWORD,
    // Make sure to match the ones we need
    DIRECTUS_URL: 'https://sso-dev.hashpass.co' // ensures it's correct
};

const varsStr = Object.entries(newVars).map(([k, v]) => `${k}="${v}"`).join(',');

// Update lambda config
console.log('Updating DEV Lambda config...');
execSync(`aws lambda update-function-configuration --function-name hashpass-dev-expo-router-api --region us-east-1 --environment "Variables={${varsStr}}"`, { stdio: 'inherit' });
console.log('Done dev!');
