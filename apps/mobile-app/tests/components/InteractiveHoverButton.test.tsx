import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('lucide-react-native', () => ({ ArrowRight: 'ArrowRight' }));
jest.mock('../../lib/utils', () => ({ cn: (...values: Array<string | undefined>) => values.filter(Boolean).join(' ') }));

import { InteractiveHoverButton } from '../../components/InteractiveHoverButton.web';

let view: ReactTestRenderer;

afterEach(() => act(() => view?.unmount()));

it('uses the shared deep-red palette for light primary actions', () => {
  act(() => { view = create(<InteractiveHoverButton text="Start now" data-testid="start" />); });
  const button = view.root.findByType('button');
  expect(button.props.style).toMatchObject({ '--cta-accent': '#af0d01', '--cta-fill': '#af0d01' });
  expect(button.props.children[0].props.children).toBe('Start now');
});

it('uses the shared cyan palette for dark primary actions and preserves click behavior', () => {
  const onClick = jest.fn();
  act(() => { view = create(<InteractiveHoverButton tone="dark" text="Enter" onClick={onClick} />); });
  const button = view.root.findByType('button');
  expect(button.props.style).toMatchObject({ '--cta-accent': '#22d3ee', '--cta-fill': '#0e7490' });
  act(() => { button.props.onClick({}); });
  expect(onClick).toHaveBeenCalledTimes(1);
});
