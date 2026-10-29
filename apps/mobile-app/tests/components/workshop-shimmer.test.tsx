import React from 'react';
import WorkshopShimmer from '../../components/WorkshopShimmer';

const mockMotion = jest.fn(() => true);
jest.mock('../../hooks/useMotionAllowed', () => ({ useMotionAllowed: () => mockMotion() }));
jest.mock('../../components/SafeLinearGradient', () => 'SafeLinearGradient');

const { act, create } = require('react-test-renderer');

const render = async (props: Record<string, unknown> = {}) => {
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<WorkshopShimmer color="#AF52DE" testID="fx" {...props} />);
  });
  await act(async () => {
    renderer!.root.findAll((node: any) => node.props.testID === 'fx' && node.props.onLayout)[0].props.onLayout({ nativeEvent: { layout: { width: 320, height: 160 } } });
  });
  return renderer!;
};

describe('WorkshopShimmer', () => {
  it('tints the card and sweeps a highlight when motion is allowed', async () => {
    mockMotion.mockReturnValue(true);
    const renderer = await render({ isDark: true });
    expect(renderer.root.findAllByType('SafeLinearGradient' as any)).toHaveLength(2);
    expect(renderer.root.findAll((node: any) => node.props.testID === 'fx' && node.props.onLayout)[0].props.pointerEvents).toBe('none');
    await act(async () => renderer.unmount());
  });

  it('keeps only the static tint under reduced motion', async () => {
    mockMotion.mockReturnValue(false);
    const renderer = await render();
    expect(renderer.root.findAllByType('SafeLinearGradient' as any)).toHaveLength(1);
    await act(async () => renderer.unmount());
  });
});
