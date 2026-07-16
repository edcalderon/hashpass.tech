/// <reference types="jest" />

import {
  resolveDashboardStackOptions,
  resolveRootStackMotionOptions,
} from '../../lib/native-navigation-options';

describe('resolveRootStackMotionOptions', () => {
  it('disables Android root native-stack transition events during auth redirects', () => {
    expect(resolveRootStackMotionOptions('android')).toEqual({
      animation: 'none',
      animationTypeForReplace: 'push',
    });
  });

  it('keeps non-Android root transitions unchanged', () => {
    expect(resolveRootStackMotionOptions('ios')).toEqual({
      animation: 'slide_from_right',
      animationTypeForReplace: 'push',
    });
  });
});

describe('resolveDashboardStackOptions', () => {
  it('disables Android dashboard native-stack transition events', () => {
    expect(resolveDashboardStackOptions('android')).toEqual({
      headerShown: false,
      gestureEnabled: false,
      animation: 'none',
      animationTypeForReplace: 'push',
    });
  });

  it('keeps non-Android dashboard transitions unchanged', () => {
    expect(resolveDashboardStackOptions('ios')).toEqual({
      headerShown: false,
      gestureEnabled: false,
    });
  });
});
