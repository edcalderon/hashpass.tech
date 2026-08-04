/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';

const { act, create } = require('react-test-renderer');

// This project's jest environment always resolves react-native's
// Platform.OS to 'web' (matching the app's actual primary target here —
// hashpass.tech is the Expo *web* export) regardless of attempts to
// override it via jest.mock/doMock, so this only exercises the real
// <video> branch — the one this component actually renders in practice.
import { DemoVideoPlayer } from '../../components/DemoVideoPlayer';

describe('DemoVideoPlayer', () => {
  it('renders a real <video> element with the given src/poster/muted props', () => {
    const onPlayingChange = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <DemoVideoPlayer
          src="/x.mp4"
          poster="/x.jpg"
          muted
          fallbackText="Only on web"
          onPlayingChange={onPlayingChange}
        />,
      );
    });

    const json = renderer.toJSON();
    expect(json.type).toBe('video');
    expect(json.props.src).toBe('/x.mp4');
    expect(json.props.poster).toBe('/x.jpg');
    expect(json.props.muted).toBe(true);
  });

  it('calls onPlayingChange as the underlying <video> plays/pauses', () => {
    const onPlayingChange = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <DemoVideoPlayer src="/x.mp4" poster="/x.jpg" fallbackText="Only on web" onPlayingChange={onPlayingChange} />,
      );
    });

    const json = renderer.toJSON();
    act(() => {
      json.props.onPlay();
    });
    expect(onPlayingChange).toHaveBeenCalledWith(true);

    act(() => {
      json.props.onPause();
    });
    expect(onPlayingChange).toHaveBeenCalledWith(false);
  });

  it('calls onTimeUpdate when the underlying <video> reports a time update', () => {
    const onTimeUpdate = jest.fn();
    let renderer: any;
    act(() => {
      renderer = create(
        <DemoVideoPlayer src="/x.mp4" poster="/x.jpg" fallbackText="Only on web" onTimeUpdate={onTimeUpdate} />,
      );
    });

    act(() => {
      renderer.toJSON().props.onTimeUpdate();
    });
    expect(onTimeUpdate).toHaveBeenCalledTimes(1);
  });
});
