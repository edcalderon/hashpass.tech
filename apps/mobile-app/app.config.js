const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { buildExpoConfig } = require('./lib/eas-config');

const baseConfig = require('./app.json').expo;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  dotenv.config({
    path: filePath,
    override: false,
    quiet: true,
  });
}

// Load the repo-level env first so local and EAS builds can share one source of truth.
loadEnvFile(path.resolve(__dirname, '../../.env'));
loadEnvFile(path.resolve(__dirname, '.env'));

module.exports = ({ config } = {}) => {
  const mergedBase = config || baseConfig;

  return buildExpoConfig({ baseConfig: mergedBase, env: process.env });
};
