const { withPodfile } = require('expo/config-plugins');

const MODULAR_HEADERS_DIRECTIVE = 'use_modular_headers!';

function addModularHeaders(contents) {
  if (contents.includes(MODULAR_HEADERS_DIRECTIVE)) return contents;

  return contents.replace(
    /^(platform :ios[^\n]*)$/m,
    `$1\n${MODULAR_HEADERS_DIRECTIVE}`,
  );
}

function withIosModularHeaders(config) {
  return withPodfile(config, (podfileConfig) => {
    podfileConfig.modResults.contents = addModularHeaders(podfileConfig.modResults.contents);
    return podfileConfig;
  });
}

module.exports = withIosModularHeaders;
module.exports.addModularHeaders = addModularHeaders;
