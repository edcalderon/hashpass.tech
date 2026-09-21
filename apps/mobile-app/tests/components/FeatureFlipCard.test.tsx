import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../components/InteractiveHoverButton', () => {
  const ReactRef = require('react');
  return { InteractiveHoverButton: (props: object) => ReactRef.createElement('InteractiveHoverButton', props) };
});
jest.mock('../../lib/utils', () => ({ cn: (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' ') }));
jest.mock('lucide-react', () => {
  const Icon = () => null;
  return { Code2: Icon, KeyRound: Icon, RefreshCcw: Icon, ShieldCheck: Icon };
});

import FeatureFlipCard from '../../components/FeatureFlipCard';

let view: ReactTestRenderer;
const originalRaf = global.requestAnimationFrame;

beforeEach(() => {
  mockPush.mockReset();
  Object.defineProperty(global, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(performance.now() + 600);
      return 1;
    },
  });
});

afterEach(() => {
  Object.defineProperty(global, 'requestAnimationFrame', { configurable: true, value: originalRaf });
  act(() => view?.unmount());
});

it('animates a live metric after opening the compact card', () => {
  act(() => {
    view = create(<FeatureFlipCard title="Secure" description="Private event data." metricValue={61} metricLabel="verified speakers" />);
  });

  const card = view.root.findByProps({ role: 'button', 'aria-label': 'Secure' });
  expect(card.props['aria-expanded']).toBe(false);

  act(() => { card.props.onClick({ currentTarget: {} }); });

  expect(card.props['aria-expanded']).toBe(true);
  expect(view.root.findAllByType('strong').map(node => node.props.children)).toContain('61');
});

it('reports the flipped card to its carousel owner', () => {
  const onFlipChange = jest.fn();
  act(() => {
    view = create(
      <FeatureFlipCard
        title="Sync"
        description="Private event data."
        isFlipped={false}
        onFlipChange={onFlipChange}
      />,
    );
  });

  const card = view.root.findByProps({ role: 'button', 'aria-label': 'Sync' });
  const cardElement = {} as HTMLDivElement;
  act(() => { card.props.onClick({ currentTarget: cardElement }); });

  expect(onFlipChange).toHaveBeenCalledWith(true, cardElement);
});

it('keeps the CTA isolated from the flip action and routes to its destination', () => {
  act(() => {
    view = create(<FeatureFlipCard title="Entry" description="Live QR validation." actionHref="/(shared)/auth" />);
  });
  const action = view.root.findByType('InteractiveHoverButton' as any);
  const stopPropagation = jest.fn();

  act(() => { action.props.onClick({ stopPropagation }); });

  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith('/(shared)/auth');
});
