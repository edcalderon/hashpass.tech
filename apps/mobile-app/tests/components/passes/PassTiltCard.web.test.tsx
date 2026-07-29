/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';

import PassTiltCard, { PassDepthLayer } from '../../../components/passes/PassTiltCard.web';

const render = (element: React.ReactElement) => {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(element);
  });
  return renderer!;
};

describe('PassTiltCard.web', () => {
  it('keeps depth layers in the card 3D context', () => {
    const renderer = render(
      <PassDepthLayer depth={12} pointerEvents="none" style={{ opacity: 0.8 }}>
        <div>Layer content</div>
      </PassDepthLayer>,
    );
    const layer = renderer.root.findByType('div');

    expect(layer.props.style).toMatchObject({
      opacity: 0.8,
      transform: 'translateZ(12px)',
      transformStyle: 'preserve-3d',
      pointerEvents: 'none',
    });
  });

  it('renders the interactive shell and forwards clicks without React animation state', () => {
    const onPress = jest.fn();
    const renderer = render(
      <PassTiltCard accentColor="#007AFF" onPress={onPress}>
        <div>Pass face</div>
      </PassTiltCard>,
    );
    const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onClick === 'function');

    expect(outer).toBeTruthy();
    expect(outer?.props.style.cursor).toBe('pointer');
    expect(outer?.props.style.perspective).toBe('1100px');

    act(() => {
      outer?.props.onClick();
      outer?.props.onPointerLeave();
      outer?.props.onPointerCancel();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not advertise pointer interactivity when no click handler exists', () => {
    const renderer = render(<PassTiltCard>Pass face</PassTiltCard>);
    const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onPointerMove === 'function');

    expect(outer?.props.style.cursor).toBeUndefined();
  });
});
