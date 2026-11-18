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
