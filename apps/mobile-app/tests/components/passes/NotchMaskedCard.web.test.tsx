/// <reference types="jest" />

import React from 'react';

// Untyped require -- see the matching comment in PassWalletCard.test.tsx:
// the real @types/react-test-renderer types don't accept the raw 'div'/
// custom-string component names these tests query by in some other files,
// and staying consistent with the rest of this suite avoids mixing import
// styles for the same library.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { act, create } = require('react-test-renderer');

import NotchMaskedCard from '../../../components/passes/NotchMaskedCard.web';

describe('NotchMaskedCard.web', () => {
  it('renders a div with the notch geometry baked into a CSS mask-image data URI', () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <NotchMaskedCard
          geometry={{ width: 340, height: 390, cornerRadius: 16, notchRadius: 11, notchYRatio: 0.58 }}
          style={{ width: '100%', height: '100%' }}
        >
          <div>Card face</div>
        </NotchMaskedCard>,
      );
    });

    const div = renderer!.root.findByType('div');

    expect(div.props.children).toBeTruthy();
    expect(div.props.style.width).toBe('100%');
    expect(div.props.style.maskSize).toBe('100% 100%');
    expect(div.props.style.WebkitMaskSize).toBe('100% 100%');
    expect(div.props.style.maskRepeat).toBe('no-repeat');
    expect(div.props.style.WebkitMaskRepeat).toBe('no-repeat');
    expect(div.props.style.maskImage).toContain('data:image/svg+xml;utf8,');
    expect(div.props.style.maskImage).toBe(div.props.style.WebkitMaskImage);
  });

  it('works with no style prop at all', () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <NotchMaskedCard geometry={{ width: 100, height: 100, cornerRadius: 8, notchRadius: 5, notchYRatio: 0.5 }}>
          <div>Bare</div>
        </NotchMaskedCard>,
      );
    });

    const div = renderer!.root.findByType('div');
    expect(div.props.style.maskImage).toBeTruthy();
  });
});
