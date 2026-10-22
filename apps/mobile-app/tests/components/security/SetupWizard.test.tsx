import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Switch } from 'react-native';

import SetupWizard from '../../../components/security/SetupWizard';
import { getSetupWizardView, setupWizardMachine, type SetupWizardContext, type SetupWizardView } from '../../../hooks/setup-wizard-machine';
import type { UsePin } from '../../../hooks/usePin';

jest.mock('../../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string, params?: Record<string, unknown>) =>
  Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), fallback) }) }));
let mockFlow: any;
jest.mock('../../../components/security/PinFlow', () => ({ __esModule: true, default: (props: any) => { mockFlow = props; return null; } }));

const baseContext = (overrides: Partial<SetupWizardContext> = {}): SetupWizardContext => ({
  setup: null, goals: [], topics: [], privacyScope: 'private', consent: false, pinEnabled: false, revisiting: false, error: null, ...overrides,
});
const view = (overrides: Partial<SetupWizardView> = {}): SetupWizardView => ({
  phase: 'wizard', step: 'goals', stepNumber: 1, stepCount: 3, canGoBack: false, canFinish: false, error: null, ...overrides,
});
const pin = {} as UsePin;
const control = (tree: ReactTestRenderer, label: string) => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(-1)!;
const has = (tree: ReactTestRenderer, label: string) => tree.root.findAll(node => node.props.accessibilityLabel === label).length > 0;
const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());

async function render(v: SetupWizardView, context: SetupWizardContext, send = jest.fn(), extra: Partial<React.ComponentProps<typeof SetupWizard>> = {}) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<SetupWizard mode="light" view={v} context={context} send={send} pin={pin} {...extra} />); });
  return { tree, send };
}

describe('SetupWizard', () => {
  beforeEach(() => { mockFlow = undefined; });

  it('shows a spinner while loading, and a retry when loading failed', async () => {
    const loading = await render(view({ phase: 'loading', step: null, stepNumber: null }), baseContext());
    expect(text(loading.tree)).toContain('Getting things ready');
    act(() => loading.tree.unmount());
    const failed = await render(view({ phase: 'loadFailed', step: null, stepNumber: null, error: 'load_failed' }), baseContext());
    act(() => control(failed.tree, 'Try again').props.onPress());
    expect(failed.send).toHaveBeenCalledWith({ type: 'RETRY' });
    act(() => failed.tree.unmount());
  });

  it('renders nothing for a transient state with no step', async () => {
    const { tree } = await render(view({ step: null, stepNumber: null }), baseContext());
    expect(tree.toJSON()).toBeNull();
    act(() => tree.unmount());
  });

  it('step 1: toggles goals, stops at the limit, and continues', async () => {
    const { tree, send } = await render(view(), baseContext({ goals: ['hire', 'learn', 'friends'] }));
    expect(text(tree)).toContain('Step 1 of 3');
    act(() => control(tree, 'Hire talent').props.onPress());
    expect(send).toHaveBeenCalledWith({ type: 'TOGGLE_GOAL', goal: 'hire' });
    expect(control(tree, 'Find a role').props.disabled).toBe(true);
    act(() => control(tree, 'Continue').props.onPress());
    expect(send).toHaveBeenCalledWith({ type: 'NEXT' });
    expect(has(tree, 'Back')).toBe(false);
    act(() => tree.unmount());
  });

  it('step 2: toggles topics, counts them, and can go back', async () => {
    const { tree, send } = await render(view({ step: 'topics', stepNumber: 2, canGoBack: true }), baseContext({ topics: ['AI'] }));
    expect(text(tree)).toContain('1 of 5 selected');
    act(() => control(tree, 'Web3').props.onPress());
    expect(send).toHaveBeenCalledWith({ type: 'TOGGLE_TOPIC', topic: 'Web3' });
    act(() => control(tree, 'Back').props.onPress());
    expect(send).toHaveBeenCalledWith({ type: 'BACK' });
    act(() => tree.unmount());
  });

  it('step 3: privacy, consent, PIN creation, and a finish that waits for both', async () => {
    const blocked = await render(view({ step: 'privacy', stepNumber: 3, canGoBack: true }), baseContext());
    act(() => control(blocked.tree, 'Discoverable').props.onPress());
    expect(blocked.send).toHaveBeenCalledWith({ type: 'SET_PRIVACY', scope: 'public' });
    act(() => blocked.tree.root.findByType(Switch).props.onValueChange(true));
    expect(blocked.send).toHaveBeenCalledWith({ type: 'SET_CONSENT', accepted: true });
    expect(control(blocked.tree, 'Finish setup').props.disabled).toBe(true);

    expect(mockFlow).toBeUndefined();
    await act(async () => { control(blocked.tree, 'Create my PIN').props.onPress(); });
    expect(mockFlow).toMatchObject({ scope: 'app:unlock', intent: 'create' });
    await act(async () => { mockFlow.onDone(); });
    expect(blocked.send).toHaveBeenCalledWith({ type: 'PIN_SET' });
    await act(async () => { blocked.tree.update(<SetupWizard mode="light" view={view({ step: 'privacy', stepNumber: 3, canGoBack: true })} context={baseContext({ pinEnabled: true })} send={blocked.send} pin={pin} />); });
    expect(has(blocked.tree, 'Create my PIN')).toBe(false);
    act(() => blocked.tree.unmount());

    const ready = await render(view({ step: 'privacy', stepNumber: 3, canGoBack: true, canFinish: true }), baseContext({ consent: true, pinEnabled: true }));
    expect(text(ready.tree)).toContain('PIN set');
    act(() => control(ready.tree, 'Finish setup').props.onPress());
    expect(ready.send).toHaveBeenCalledWith({ type: 'FINISH' });
    act(() => ready.tree.unmount());
  });

  it('lets someone cancel PIN creation and start it again', async () => {
    const { tree } = await render(view({ step: 'privacy', stepNumber: 3 }), baseContext());
    await act(async () => { control(tree, 'Create my PIN').props.onPress(); });
    await act(async () => { mockFlow.onCancel(); });
    expect(has(tree, 'Create my PIN')).toBe(true);
    act(() => tree.unmount());
  });

  it('keeps answers and says so when the final save failed; locks controls while finishing', async () => {
    const failed = await render(view({ step: 'privacy', stepNumber: 3, canFinish: true, error: 'save_failed' }), baseContext({ consent: true, pinEnabled: true }));
    expect(failed.tree.root.findAll(node => node.props.accessibilityRole === 'alert')[0]!.props.children).toMatch(/Your answers are kept/);
    act(() => failed.tree.unmount());
    const busy = await render(view({ phase: 'finishing', step: 'privacy', stepNumber: 3, canGoBack: true, canFinish: true }), baseContext({ consent: true, pinEnabled: true }));
    expect(control(busy.tree, 'Back').props.disabled).toBe(true);
    expect(busy.tree.root.findByType(Switch).props.disabled).toBe(true);
    act(() => busy.tree.unmount());
  });

  it('offers Close only to someone revisiting settings', async () => {
    const onClose = jest.fn();
    const first = await render(view(), baseContext(), jest.fn(), { onClose });
    expect(has(first.tree, 'Close')).toBe(false);
    act(() => first.tree.unmount());
    const again = await render(view(), baseContext({ revisiting: true }), jest.fn(), { onClose });
    act(() => control(again.tree, 'Close').props.onPress());
    expect(onClose).toHaveBeenCalled();
    act(() => again.tree.unmount());
  });

  it('works with the real view derived from the machine', () => {
    const snapshot = (setupWizardMachine as any).resolveState({ value: { wizard: 'topics' }, context: baseContext() });
    expect(getSetupWizardView(snapshot)).toMatchObject({ phase: 'wizard', step: 'topics', stepNumber: 2 });
  });
});
