/// <reference types="jest" />

describe('iOS modular headers config plugin', () => {
  it('adds the global modular headers directive once after the iOS platform declaration', () => {
    const { addModularHeaders } = require('../../plugins/withIosModularHeaders');
    const podfile = "platform :ios, '15.1'\n\nprepare_react_native_project!\n";

    const updated = addModularHeaders(podfile);

    expect(updated).toContain("platform :ios, '15.1'\nuse_modular_headers!\n");
    expect(addModularHeaders(updated)).toBe(updated);
  });
});
