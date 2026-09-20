/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
let mockLevel = 'full'; let mockReduced = false; let mockVisible = true;
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (key: string, fallback: string) => fallback || key }) }));
jest.mock('../../contexts/AnimationLevelContext', () => ({ useAnimationLevel: () => ({ animationLevel: mockLevel }) }));
jest.mock('motion/react', () => ({ motion: { article: 'article', div: 'div' }, useReducedMotion: () => mockReduced, useInView: () => mockVisible }));
jest.mock('../../components/HowItWorksIllustration', () => require('../../components/HowItWorksIllustration.web'));
import HowItWorks from '../../components/HowItWorks.web';
let view: ReactTestRenderer;
afterEach(() => { act(() => view?.unmount()); mockLevel = 'full'; mockReduced = false; mockVisible = true; });
it('shows four real vector illustrations and pauses detail motion outside the viewport', async () => {
  await act(async () => { view = create(<HowItWorks />); });
  expect(view.root.findAllByType('article')).toHaveLength(4);
  expect(view.root.findAllByType('svg').every(svg => svg.props.className.includes('active'))).toBe(true);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-scan-beam' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-packet' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-chat-left' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-chat-right' })).toHaveLength(1);
  mockVisible = false; act(() => view.update(<HowItWorks />));
  expect(view.root.findAllByType('svg').every(svg => !svg.props.className.includes('active'))).toBe(true);
});
it('shows LKS reward increments around a diamond instead of the old star coin', async () => {
  await act(async () => { view = create(<HowItWorks />); });
  const labels = view.root.findAllByType('text').map(node => node.props.children);
  expect(labels).toEqual(expect.arrayContaining(['+5', '+10', '$LKS']));
  expect(view.root.findAllByProps({ className: 'hp-detail hp-diamond' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-reward-five' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-reward-ten' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-coin' })).toHaveLength(0);
});
it.each(['none', 'reduced', 'system'])('keeps cards visible without entrance or looping effects for %s motion', async mode => {
  mockLevel = mode === 'system' ? 'full' : mode; mockReduced = mode === 'system';
  await act(async () => { view = create(<HowItWorks />); });
  expect(view.root.findAllByType('article').every(card => card.props.initial === false && !card.props.whileHover)).toBe(true);
  expect(view.root.findAllByType('svg').every(svg => !svg.props.className.includes('active'))).toBe(true);
});
