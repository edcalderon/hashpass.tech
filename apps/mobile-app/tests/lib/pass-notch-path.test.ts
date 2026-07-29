/// <reference types="jest" />

import {
  buildNotchMaskDataUri,
  buildNotchMaskPath,
  buildNotchMaskSvgMarkup,
} from '../../lib/pass-notch-path';

const geometry = { width: 340, height: 390, cornerRadius: 16, notchRadius: 11, notchYRatio: 0.58 };

describe('buildNotchMaskPath', () => {
  it('places the two notch circles at the left/right edges, at notchYRatio of the height', () => {
    const d = buildNotchMaskPath(geometry);

    expect(d).toContain('M -11,226.2');
    expect(d).toContain('M 329,226.2');
  });
});

describe('buildNotchMaskSvgMarkup', () => {
  it('wraps the evenodd path in a viewBox-scaled, non-uniformly-stretched SVG', () => {
    const markup = buildNotchMaskSvgMarkup(geometry);

    expect(markup).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('viewBox="0 0 340 390"');
    expect(markup).toContain('preserveAspectRatio="none"');
    expect(markup).toContain('fill-rule="evenodd"');
    expect(markup).toContain(buildNotchMaskPath(geometry));
  });
});

describe('buildNotchMaskDataUri', () => {
  it('percent-encodes the SVG markup into a data: URI usable as a CSS mask-image', () => {
    const uri = buildNotchMaskDataUri(geometry);

    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(uri.replace('data:image/svg+xml;utf8,', ''))).toBe(
      buildNotchMaskSvgMarkup(geometry)
    );
  });
});
