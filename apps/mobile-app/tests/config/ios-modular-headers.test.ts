/// <reference types="jest" />

describe('iOS modular headers config plugin', () => {
  const { addModularHeaders } = require('../../plugins/withIosModularHeaders');
  const podfile = "platform :ios, '15.1'\n\ntarget 'HASHPASS' do\n  use_expo_modules!\n\n  config = use_native_modules!\nend\n";

  it('makes only the Swift pod dependencies modular, once, inside the app target', () => {
    const updated = addModularHeaders(podfile);

    expect(updated).toContain("use_expo_modules!\n  pod 'PromisesObjC', :modular_headers => true\n  pod 'GoogleUtilities', :modular_headers => true\n  pod 'RecaptchaInterop', :modular_headers => true\n");
    expect(updated).not.toMatch(/^use_modular_headers!/m);
    expect(addModularHeaders(updated)).toBe(updated);
  });

  it('leaves a Podfile without an Expo modules target untouched', () => {
    const bare = "platform :ios, '15.1'\n";

    expect(addModularHeaders(bare)).toBe(bare);
  });
});

describe('iOS fmt C++17 pin (Xcode 26 consteval)', () => {
  const { pinFmtToCxx17 } = require('../../plugins/withIosModularHeaders');
  const podfile = [
    "target 'HASHPASS' do",
    '  post_install do |installer|',
    '    react_native_post_install(',
    '      installer,',
    '      config[:reactNativePath],',
    '      :mac_catalyst_enabled => false,',
    '    )',
    '',
    '    # keep signing off for resource bundles',
    '  end',
    'end',
    '',
  ].join('\n');

  it('pins only the fmt target to C++17 right after react_native_post_install, once', () => {
    const updated = pinFmtToCxx17(podfile);

    expect(updated).toContain("    )\n    # hashpass: pin fmt to C++17 for Xcode 26\n");
    expect(updated).toContain("next unless target.name == 'fmt'");
    expect(updated).toContain("build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'");
    expect(pinFmtToCxx17(updated)).toBe(updated);
  });

  it('leaves a Podfile without react_native_post_install untouched', () => {
    const bare = "platform :ios, '15.1'\n";

    expect(pinFmtToCxx17(bare)).toBe(bare);
  });
});
