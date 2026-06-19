/// <reference types="jest" />

const mockPlatform = { OS: 'web' };

jest.mock('react-native', () => ({
  Platform: mockPlatform,
}));

jest.mock('../../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg', () => 'white-cyan-svg');
jest.mock('../../assets/logos/hashpass/logo-full-hashpass-black.svg', () => 'black-svg');
jest.mock('../../assets/logos/hashpass/logo-full-hashpass-white.png', () => 'white-native-png');
jest.mock('../../assets/logos/hashpass/logo-full-hashpass-white-cyan.png', () => 'white-cyan-native-png');

const { getHashpassFullLogo } = require('../../lib/hashpass-logo');

describe('getHashpassFullLogo', () => {
  it('uses the white-cyan logo on dark web surfaces', () => {
    mockPlatform.OS = 'web';

    expect(getHashpassFullLogo(true)).toBe('white-cyan-svg');
  });

  it('uses the black logo on light web surfaces', () => {
    mockPlatform.OS = 'web';

    expect(getHashpassFullLogo(false)).toBe('black-svg');
  });

  it('uses the transparent native logo on light native surfaces', () => {
    mockPlatform.OS = 'android';

    expect(getHashpassFullLogo(false)).toBe('white-native-png');
  });
});
