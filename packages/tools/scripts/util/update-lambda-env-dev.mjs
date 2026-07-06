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
const googleClientId =
    envParsed.GOOGLE_CLIENT_ID ||
    envParsed.BETTER_AUTH_GOOGLE_CLIENT_ID ||
    envParsed.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    '';
const googleClientSecret =
    envParsed.GOOGLE_CLIENT_SECRET ||
    envParsed.BETTER_AUTH_GOOGLE_CLIENT_SECRET ||
    '';

const newVars = {
    ...currentVars,
    // Make sure to match the ones we need
    DIRECTUS_URL: 'https://sso-dev.hashpass.co' // ensures it's correct
};

newVars.GOOGLE_CLIENT_ID = googleClientId;
newVars['GOOGLE_CLIENT_SECRET'] = googleClientSecret;
newVars.BETTER_AUTH_GOOGLE_CLIENT_ID = googleClientId;
newVars['BETTER_AUTH_GOOGLE_CLIENT_SECRET'] = googleClientSecret;
newVars.ADMIN_EMAIL = envParsed.ADMIN_EMAIL;
newVars['ADMIN_PASSWORD'] = envParsed.ADMIN_PASSWORD;

const varsStr = Object.entries(newVars).map(([k, v]) => `${k}="${v}"`).join(',');

// Update lambda config
console.log('Updating DEV Lambda config...');
execSync(`aws lambda update-function-configuration --function-name hashpass-dev-expo-router-api --region us-east-1 --environment "Variables={${varsStr}}"`, { stdio: 'inherit' });
console.log('Done dev!');
