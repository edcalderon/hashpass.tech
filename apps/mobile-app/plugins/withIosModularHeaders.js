const { withPodfile } = require('expo/config-plugins');

// A global `use_modular_headers!` makes React Native's own pods redefine the
// `react_runtime` module (RN 0.79), so only the Objective-C dependencies of the
// Swift AppCheckCore pod (via Google Sign-In) are made modular.
const MODULAR_PODS = ['PromisesObjC', 'GoogleUtilities', 'RecaptchaInterop'];

function addModularHeaders(contents) {
  const missing = MODULAR_PODS.filter((pod) => !contents.includes(`pod '${pod}', :modular_headers => true`));
  if (missing.length === 0) return contents;

  const declarations = missing.map((pod) => `  pod '${pod}', :modular_headers => true`).join('\n');

  return contents.replace(/^([ \t]*use_expo_modules![ \t]*)$/m, `$1\n${declarations}`);
}

// Xcode 26's clang enables C++20 `consteval` for the fmt pod bundled with React
// Native 0.79 (fmt 11.0.2), which then fails to compile (`format-inl.h`: call to
// consteval function is not a constant expression). fmt only uses `consteval`
// at C++20 and above, so the fmt target is pinned to C++17.
const FMT_CXX17_MARKER = '# hashpass: pin fmt to C++17 for Xcode 26';
const FMT_CXX17_SNIPPET = [
  `    ${FMT_CXX17_MARKER}`,
  '    installer.pods_project.targets.each do |target|',
  "      next unless target.name == 'fmt'",
  '      target.build_configurations.each do |build_config|',
  "        build_config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'",
  '      end',
  '    end',
].join('\n');

function pinFmtToCxx17(contents) {
  if (contents.includes(FMT_CXX17_MARKER)) return contents;

  // Insert after react_native_post_install(...) so React Native's own build
  // settings cannot override the pin.
  return contents.replace(/(^[ \t]*react_native_post_install\([\s\S]*?^[ \t]*\)[ \t]*$)/m, `$1\n${FMT_CXX17_SNIPPET}`);
}

function withIosModularHeaders(config) {
  return withPodfile(config, (podfileConfig) => {
    podfileConfig.modResults.contents = pinFmtToCxx17(addModularHeaders(podfileConfig.modResults.contents));
    return podfileConfig;
  });
}

module.exports = withIosModularHeaders;
module.exports.addModularHeaders = addModularHeaders;
module.exports.pinFmtToCxx17 = pinFmtToCxx17;
