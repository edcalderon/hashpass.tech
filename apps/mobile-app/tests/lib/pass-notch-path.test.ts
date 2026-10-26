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

describe('perforation dots', () => {
  const dotted = {
    ...geometry,
    perforationDots: { radius: 2, spacing: 12, margin: 4 },
  } as const;

  it('punches a centered row of dots on the side holes center line', () => {
    const d = buildNotchMaskPath(dotted);
    const dotCount = d.split('M ').length - 3; // rect + two side holes first
    expect(dotCount).toBeGreaterThan(20);

    // Every dot shares the side holes' center Y, so the section reads as one
    // straight die-cut line instead of a painted dashed approximation.
    const yValues = new Set(
      d.match(/M (-?[\d.]+),([\d.]+)/g)?.map((move) => move.split(',')[1]),
    );
    expect(yValues.has('226.2')).toBe(true);
  });

  it('keeps the row clear of the side holes and centered in the span', () => {
    const d = buildNotchMaskPath(dotted);
    // Skip the side holes' arc moves; only row dots sit inside the span.
    const xs = (d.match(/M (-?[\d.]+),226\.2/g) || [])
      .map((move) => parseFloat(move.slice(2)))
      .filter((x) => x >= 11 + 4 && x <= 340 - 11 - 4);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(11 + 4);
    expect(Math.max(...xs)).toBeLessThanOrEqual(340 - 11 - 4);
    const spacing = new Set(
      xs.slice(1).map((x, i) => Math.round((x - xs[i]) * 10) / 10),
    );
    expect([...spacing]).toEqual([12]);
  });

  it('omits the dots entirely when no perforation geometry is given', () => {
    expect(buildNotchMaskPath(geometry).split('M ').length).toBe(4); // rect + two holes
  });
});
