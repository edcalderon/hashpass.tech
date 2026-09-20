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
  mockVisible = false; act(() => view.update(<HowItWorks />));
  expect(view.root.findAllByType('svg').every(svg => !svg.props.className.includes('active'))).toBe(true);
});
it.each(['none', 'reduced', 'system'])('keeps cards visible without entrance or looping effects for %s motion', async mode => {
  mockLevel = mode === 'system' ? 'full' : mode; mockReduced = mode === 'system';
  await act(async () => { view = create(<HowItWorks />); });
  expect(view.root.findAllByType('article').every(card => card.props.initial === false && !card.props.whileHover)).toBe(true);
  expect(view.root.findAllByType('svg').every(svg => !svg.props.className.includes('active'))).toBe(true);
});
