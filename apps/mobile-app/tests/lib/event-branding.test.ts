/// <reference types="jest" />

import { resolveEventImageSource } from '../../lib/event-branding';

jest.mock('../../assets/logos/bsl/bsl-ontour-pro.svg', () => 'bsl-ontour-svg');
jest.mock('../../assets/logos/bsl/bsl-peru-pro.svg', () => 'bsl-peru-svg');
jest.mock('../../assets/logos/bsl/bsl-chile-pro.svg', () => 'bsl-chile-svg');
jest.mock('../../assets/logos/bsl/bsl-colombia-pro.svg', () => 'bsl-colombia-svg');
jest.mock('../../assets/logos/bsl/BSL-Logo-fondo-oscuro-2024.svg', () => 'bsl-archive-logo-svg');
jest.mock('../../assets/images/bsl2025-hero.svg', () => 'bsl-archive-banner-svg');
jest.mock('../../assets/logos/bsl/bsl-white.png', () => 'bsl-white-png');
jest.mock('../../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg', () => 'hashpass-dark-svg');
jest.mock('../../assets/logos/hashpass/logo-full-hashpass-black.svg', () => 'hashpass-light-svg');

describe('resolveEventImageSource', () => {
  it('maps the dead BSL 2025 banner URL to a local banner asset', () => {
    expect(
      resolveEventImageSource('https://blockchainsummit.la/wp-content/uploads/2025/09/bsl2025-banner.jpg')
    ).toBe('bsl-archive-banner-svg');
  });

  it('maps any Summit image URL to the local archive banner fallback', () => {
    expect(
      resolveEventImageSource('https://blockchainsummit.la/wp-content/uploads/2025/10/speakers-banner.jpg')
    ).toBe('bsl-archive-banner-svg');
  });

  it('maps the Summit logo URL to the local archive logo asset', () => {
    expect(
      resolveEventImageSource('https://blockchainsummit.la/wp-content/uploads/2025/09/logo-bsl.svg')
    ).toBe('bsl-archive-logo-svg');
  });
});
