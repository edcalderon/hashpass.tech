import React from 'react';
import { act, create } from 'react-test-renderer';

const FlipWords = jest.requireActual('../../components/FlipWords.web.tsx').default;
jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'motion.div', span: 'motion.span' },
}));

it('keeps position static and gives the exiting blur a valid starting value', () => {
  jest.useFakeTimers();
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(<FlipWords words={['one', 'two']} duration={100} />); });
  const root = renderer!.root.findByType('motion.div' as any);
  expect(root.props.style.position).toBe('relative');
  expect(root.props.initial.filter).toBe('blur(0px)');
  expect(root.props.animate.filter).toBe('blur(0px)');
  expect(root.props.exit.position).toBeUndefined();
  expect(root.props.exit.filter).toBe('blur(8px)');
  act(() => { jest.advanceTimersByTime(100); });
  expect(renderer!.root.findByType('motion.div' as any).props.children[0].key).toBe('two0');
  act(() => renderer!.unmount());
  jest.useRealTimers();
});
