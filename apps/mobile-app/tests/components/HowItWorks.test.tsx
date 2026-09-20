/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
let mockLevel = 'full'; let mockReduced = false; let mockVisible = true;
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (key: string, fallback: string) => fallback || key }) }));
jest.mock('../../contexts/AnimationLevelContext', () => ({ useAnimationLevel: () => ({ animationLevel: mockLevel }) }));
jest.mock('motion/react', () => ({ motion: { article: 'article', div: 'div', p: 'p' }, useReducedMotion: () => mockReduced, useInView: () => mockVisible }));
jest.mock('../../components/HowItWorksIllustration', () => require('../../components/HowItWorksIllustration.web'));
jest.mock('../../lib/morph-icon', () => ({ MorphIcon: 'MorphIcon' }));
jest.mock('lucide', () => ({ Info: 'Info', X: 'X' }));
import HowItWorks from '../../components/HowItWorks.web';
import HowItWorksIllustration from '../../components/HowItWorksIllustration.web';
let view: ReactTestRenderer;
afterEach(() => { act(() => view?.unmount()); mockLevel = 'full'; mockReduced = false; mockVisible = true; });
it('reveals the section as one composition and pauses all scene motion outside the viewport', async () => {
  await act(async () => { view = create(<HowItWorks />); });
  expect(view.root.findAllByType('article')).toHaveLength(4);
  expect(view.root.findAllByType('article').every(card => card.props.animate?.opacity === 1)).toBe(true);
  expect(view.root.findAllByType('svg').every(svg => svg.props.className.includes('active'))).toBe(true);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-scan-beam' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-packet' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-chat-left' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-chat-right' })).toHaveLength(1);
  mockVisible = false; act(() => view.update(<HowItWorks />));
  expect(view.root.findAllByType('article').every(card => card.props.animate?.opacity === 0)).toBe(true);
  expect(view.root.findAllByType('svg').every(svg => !svg.props.className.includes('active'))).toBe(true);
});
it('uses product UI scenes with a neutral canvas and $LKS currency controls', async () => {
  await act(async () => { view = create(<HowItWorks />); });
  const labels = view.root.findAllByType('text').map(node => node.props.children);
  expect(labels).toEqual(expect.arrayContaining(['EVENT PASS', 'EVENT EXPLORER', 'AGENDA', 'SPEAKERS', 'FIND ATTENDEES', '$LKS WALLET', '+5', '+10', '$LKS']));
  expect(view.root.findAllByProps({ className: 'hp-detail hp-diamond' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-reward-five' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-reward-ten' })).toHaveLength(1);
  expect(view.root.findAllByProps({ className: 'hp-detail hp-coin' })).toHaveLength(0);
  expect(view.root.findAllByProps({ className: 'hashpass-how-scene' }).every(scene => !('background' in scene.props.style))).toBe(true);
});
it.each(['none', 'reduced', 'system'])('keeps cards visible without entrance or looping effects for %s motion', async mode => {
  mockLevel = mode === 'system' ? 'full' : mode; mockReduced = mode === 'system';
  await act(async () => { view = create(<HowItWorks />); });
  expect(view.root.findAllByType('article').every(card => card.props.initial === false && !card.props.whileHover)).toBe(true);
  expect(view.root.findAllByType('svg').every(svg => !svg.props.className.includes('active'))).toBe(true);
});
it('provides translated-scene fallbacks when an illustration is rendered alone', () => {
  act(() => { view = create(<HowItWorksIllustration kind="scan" color="#06b6d4" />); });
  expect(view.root.findAllByType('text').map(node => node.props.children)).toContain('EVENT PASS');
});
it('keeps card descriptions hidden until its morphing info control is requested', async () => {
  await act(async () => { view = create(<HowItWorks />); });
  expect(view.root.findAllByType('p').map(node => node.props.children)).not.toContain('Skip the line. Your pass is a live QR code that gets you into any event instantly — no printouts, no paperwork.');

  act(() => { view.root.findAllByType('button')[0].props.onClick(); });

  expect(view.root.findAllByType('button')[0].props['aria-expanded']).toBe(true);
  expect(view.root.findAllByType('p').map(node => node.props.children)).toContain('Skip the line. Your pass is a live QR code that gets you into any event instantly — no printouts, no paperwork.');
});
