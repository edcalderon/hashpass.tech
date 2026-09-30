/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockCaptchaWidget = jest.fn(() => null);
jest.mock('@hashpass/ui/CaptchaWidget', () => ({
  CaptchaWidget: (props: Record<string, unknown>) => mockCaptchaWidget(props),
}));

import SupportCaptcha from '../../components/SupportCaptcha.web';

describe('components/SupportCaptcha.web', () => {
  it('passes all props straight through to the underlying CaptchaWidget', async () => {
    const onSolve = jest.fn();
    const onReset = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      TestRenderer.create(
        <SupportCaptcha
          apiEndpoint="https://api.hashpass.tech/api/captcha/"
          onSolve={onSolve}
          onReset={onReset}
          onError={onError}
          resetKey={2}
        />,
      );
    });

    expect(mockCaptchaWidget).toHaveBeenCalledWith({
      apiEndpoint: 'https://api.hashpass.tech/api/captcha/',
      onSolve,
      onReset,
      onError,
      resetKey: 2,
    });
  });
});
