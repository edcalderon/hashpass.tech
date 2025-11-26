// Test placeholder conversion
function camelToUpperSnake(str) {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '');
}

const emails = require('../i18n/locales/emails.json');
const welcomeEn = emails.welcome.en.html;

console.log('Testing placeholder conversion:\n');
const testKeys = [
  'videoButton', 
  'videoButtonClick', 
  'videoTip', 
  'journeyTitle',
  'journeyText',
  'featureExpertSpeakers',
  'featureExpertSpeakersDesc',
  'featureNetworking',
  'featureNetworkingDesc',
  'featureAgenda',
  'featureAgendaDesc',
  'featureDigitalWallet',
  'featureDigitalWalletDesc',
  'getStartedTitle',
  'getStartedText',
  'getStartedList1',
  'getStartedList2',
  'ctaButton',
  'ctaSubtitle'
];

testKeys.forEach(key => {
  const placeholder = `[${camelToUpperSnake(key)}]`;
  const value = welcomeEn[key];
  console.log(`${key.padEnd(30)} -> ${placeholder.padEnd(30)} ${value ? '✓' : '✗ MISSING'}`);
  if (!value) {
    console.log(`  ⚠️ Missing translation for: ${key}`);
  }
});

console.log('\n\nChecking for missing keys in translations:');
const templatePlaceholders = [
  'VIDEO_BUTTON',
  'VIDEO_BUTTON_CLICK',
  'VIDEO_TIP',
  'JOURNEY_TITLE',
  'JOURNEY_TEXT',
  'FEATURE_EXPERT_SPEAKERS',
  'FEATURE_EXPERT_SPEAKERS_DESC',
  'FEATURE_NETWORKING',
  'FEATURE_NETWORKING_DESC',
  'FEATURE_AGENDA',
  'FEATURE_AGENDA_DESC',
  'FEATURE_DIGITAL_WALLET',
  'FEATURE_DIGITAL_WALLET_DESC',
  'GET_STARTED_TITLE',
  'GET_STARTED_TEXT',
  'GET_STARTED_LIST1',
  'GET_STARTED_LIST2',
  'CTA_BUTTON',
  'CTA_SUBTITLE'
];

templatePlaceholders.forEach(placeholder => {
  // Convert back to camelCase to check
  const camelKey = placeholder.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  const value = welcomeEn[camelKey];
  console.log(`${placeholder.padEnd(35)} -> ${camelKey.padEnd(30)} ${value ? '✓' : '✗ MISSING'}`);
});


































