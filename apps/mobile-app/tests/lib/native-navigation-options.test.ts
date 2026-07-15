/// <reference types="jest" />

import { resolveDashboardStackOptions } from '../../lib/native-navigation-options';

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
