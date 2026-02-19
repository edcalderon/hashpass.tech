import React from 'react';
import { SplashCursor } from './SplashBackground';

/**
 * Optimized wrapper for SplashCursor with reduced settings
 * to minimize resource consumption while maintaining visual appeal
 */
export function OptimizedSplashCursor(props: any) {
  // Use lower resolution settings to reduce GPU load
  const optimizedProps = {
    ...props,
    SIM_RESOLUTION: props.SIM_RESOLUTION || 32,
    DYE_RESOLUTION: props.DYE_RESOLUTION || 256,
    CAPTURE_RESOLUTION: props.CAPTURE_RESOLUTION || 128,
    DENSITY_DISSIPATION: props.DENSITY_DISSIPATION || 5.0,
    VELOCITY_DISSIPATION: props.VELOCITY_DISSIPATION || 3.0,
    PRESSURE: props.PRESSURE || 0.1,
    PRESSURE_ITERATIONS: props.PRESSURE_ITERATIONS || 5,
    CURL: props.CURL || 1,
    SPLAT_RADIUS: props.SPLAT_RADIUS || 0.1,
    SPLAT_FORCE: props.SPLAT_FORCE || 2000,
    SHADING: props.SHADING !== undefined ? props.SHADING : false,
    COLOR_UPDATE_SPEED: props.COLOR_UPDATE_SPEED || 3,
  };

  return <SplashCursor {...optimizedProps} />;
}

