/// <reference types="jest" />

import { resolveEventImageSource } from '../../lib/event-branding';

jest.mock('../../assets/logos/bsl/bsl-ontour-pro.webp', () => 'bsl-ontour-svg');
jest.mock('../../assets/logos/bsl/bsl-peru-pro.webp', () => 'bsl-peru-svg');
jest.mock('../../assets/logos/bsl/bsl-chile-pro.webp', () => 'bsl-chile-svg');
jest.mock('../../assets/logos/bsl/bsl-colombia-pro.webp', () => 'bsl-colombia-svg');
jest.mock('../../assets/logos/bsl/BSL-Logo-fondo-oscuro-2024.webp', () => 'bsl-archive-logo-svg');
jest.mock('../../assets/images/bsl2025-hero.webp', () => 'bsl-archive-banner-svg');
jest.mock('../../assets/logos/bsl/bsl-white.webp', () => 'bsl-white-png');
jest.mock('../../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp', () => 'hashpass-dark-svg');
jest.mock('../../assets/logos/hashpass/logo-full-hashpass-black.webp', () => 'hashpass-light-svg');

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
