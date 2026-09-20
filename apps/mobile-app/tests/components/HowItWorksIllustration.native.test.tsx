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

it('keeps the $LKS wallet and supported-chain story in the lightweight native illustration', () => {
  act(() => {
    view = create(<HowItWorksIllustration kind="rewards" color="#f59e0b" />);
  });

  const labels = view.root.findAllByType('SvgText' as any).map(node => node.props.children);
  expect(labels).toEqual(expect.arrayContaining(['B', '$LKS WALLET', '+5', '+10', '$LKS']));
  expect(view.root.findAllByType('Path' as any).some(node => node.props.d === 'M104 43 121 57 104 82 87 57Z')).toBe(true);
  expect(view.root.findAllByProps({ fill: '#627EEA' })).not.toHaveLength(0);
  expect(view.root.findAllByProps({ fill: '#F7931A' })).not.toHaveLength(0);
});
