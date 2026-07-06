/// <reference types="jest" />

import { createFragmentShader } from '../../components/auth/auth-background-shader';

describe('createFragmentShader', () => {
  it('uses a red-tinted palette in light mode', () => {
    const shader = createFragmentShader(4, false);

    expect(shader).toContain('vec3(1.0, 0.26, 0.18)');
    expect(shader).toContain('vec3(0.16, 0.02, 0.01)');
    expect(shader).toContain('sin(hue) * 0.18 + 0.78');
  });

  it('keeps the existing green palette in dark mode', () => {
    const shader = createFragmentShader(4, true);

    expect(shader).toContain('sin(hue) * 0.3 + 0.7');
    expect(shader).toContain('vec3(0.1, 0.12, 0.15)');
    expect(shader).toContain('vec3(0.4, 0.8, 1.0)');
  });
});
