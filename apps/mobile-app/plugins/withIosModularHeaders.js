const { withPodfile } = require('expo/config-plugins');

// A global `use_modular_headers!` makes React Native's own pods redefine the
// `react_runtime` module (RN 0.79), so only the Objective-C dependencies of the
// Swift AppCheckCore pod (via Google Sign-In) are made modular.
const MODULAR_PODS = ['PromisesObjC', 'GoogleUtilities'];

function addModularHeaders(contents) {
  const missing = MODULAR_PODS.filter((pod) => !contents.includes(`pod '${pod}', :modular_headers => true`));
  if (missing.length === 0) return contents;

  const declarations = missing.map((pod) => `  pod '${pod}', :modular_headers => true`).join('\n');

  return contents.replace(/^([ \t]*use_expo_modules![ \t]*)$/m, `$1\n${declarations}`);
}

function withIosModularHeaders(config) {
  return withPodfile(config, (podfileConfig) => {
    podfileConfig.modResults.contents = addModularHeaders(podfileConfig.modResults.contents);
    return podfileConfig;
  });
}

module.exports = withIosModularHeaders;
module.exports.addModularHeaders = addModularHeaders;
