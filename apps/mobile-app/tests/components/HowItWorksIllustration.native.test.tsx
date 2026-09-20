import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Line: 'Line',
  Path: 'Path',
  Rect: 'Rect',
  Text: 'SvgText',
}));

// Resolve the native implementation explicitly instead of Jest's web suffix.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const HowItWorksIllustration = require('../../components/HowItWorksIllustration.tsx').default;

let view: ReactTestRenderer;

afterEach(() => act(() => view?.unmount()));

it('keeps the LUKAS reward story in the lightweight native illustration', () => {
  act(() => {
    view = create(<HowItWorksIllustration kind="rewards" color="#f59e0b" />);
  });

  const labels = view.root.findAllByType('SvgText' as any).map(node => node.props.children);
  expect(labels).toEqual(['+5', '+10', '$LKS']);
  expect(view.root.findAllByType('Path' as any).some(node => node.props.d === 'M100 27 126 49 100 88 74 49Z')).toBe(true);
});
