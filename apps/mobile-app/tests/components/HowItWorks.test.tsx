/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
let mockLevel = 'full'; let mockReduced = false; let mockVisible = true; let mockDark = false;
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: mockDark }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (key: string, fallback: string) => fallback || key }) }));
jest.mock('../../contexts/AnimationLevelContext', () => ({ useAnimationLevel: () => ({ animationLevel: mockLevel }) }));
jest.mock('motion/react', () => ({ motion: { article: 'article', div: 'div', p: 'p' }, useReducedMotion: () => mockReduced, useInView: () => mockVisible }));
jest.mock('../../components/HowItWorksIllustration', () => require('../../components/HowItWorksIllustration.web'));
jest.mock('../../lib/morph-icon', () => ({ MorphIcon: 'MorphIcon' }));
jest.mock('lucide', () => ({ Maximize2: 'Maximize2', Minimize2: 'Minimize2', QrCode: 'QrCode', Network: 'Network', MessagesSquare: 'MessagesSquare', WalletCards: 'WalletCards' }));
import HowItWorks from '../../components/HowItWorks.web';
import HowItWorksIllustration from '../../components/HowItWorksIllustration.web';
let view: ReactTestRenderer;
afterEach(() => { act(() => view?.unmount()); mockLevel = 'full'; mockReduced = false; mockVisible = true; mockDark = false; });
it('reveals the section as one composition and pauses all scene motion outside the viewport', async () => {
  await act(async () => { view = create(<HowItWorks />); });
  expect(view.root.findAllByType('article')).toHaveLength(4);
  expect(view.root.findAllByType('article').every(card => card.props.style.height === 238)).toBe(true);
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
  expect(view.root.findAllByType('button')[0].props.style).toMatchObject({ width: 44, height: 44 });
  expect(view.root.findAllByType('p').map(node => node.props.children)).toContain('Skip the line. Your pass is a live QR code that gets you into any event instantly — no printouts, no paperwork.');

  act(() => { view.root.findAllByType('button')[0].props.onClick(); });
  expect(view.root.findAllByType('button')[0].props['aria-expanded']).toBe(false);
  expect(view.root.findAllByType('article')[0].props.style.height).toBe(238);
});

it('replays entry direction when the section returns while scrolling upward', async () => {
  const originalRaf = global.requestAnimationFrame;
  const originalCancel = global.cancelAnimationFrame;
  const originalAdd = window.addEventListener;
  const originalRemove = window.removeEventListener;
  let onScroll: (() => void) | undefined;
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 120 });
  Object.defineProperty(global, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { callback(performance.now()); return 1; } });
  Object.defineProperty(global, 'cancelAnimationFrame', { configurable: true, value: jest.fn() });
  Object.defineProperty(window, 'addEventListener', { configurable: true, value: (_event: string, listener: () => void) => { onScroll = listener; } });
  Object.defineProperty(window, 'removeEventListener', { configurable: true, value: jest.fn() });
  try {
    await act(async () => { view = create(<HowItWorks />); });
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 20 });
    await act(async () => { onScroll?.(); });
    expect(view.root.findAllByType('article').every(card => card.props.initial.y === -22)).toBe(true);
    act(() => { view.unmount(); });
  } finally {
    Object.defineProperty(global, 'requestAnimationFrame', { configurable: true, value: originalRaf });
    Object.defineProperty(global, 'cancelAnimationFrame', { configurable: true, value: originalCancel });
    Object.defineProperty(window, 'addEventListener', { configurable: true, value: originalAdd });
    Object.defineProperty(window, 'removeEventListener', { configurable: true, value: originalRemove });
  }
});

it('keeps the disclosure presentation token-driven in dark mode', async () => {
  mockDark = true;
  await act(async () => { view = create(<HowItWorks />); });
  const button = view.root.findAllByType('button')[0];
  expect(button.props.style.background).toBeDefined();
  act(() => { button.props.onClick(); });
  expect(view.root.findAllByType('article')[0].props.style.height).toBe('auto');
});
