/// <reference types="jest" />

import SupportCaptcha from '../../components/SupportCaptcha';

describe('components/SupportCaptcha (native stub)', () => {
  it('renders nothing -- native has no captcha solver, see the file header comment', () => {
    const result = SupportCaptcha({ apiEndpoint: 'https://api.hashpass.tech/api/captcha/', onSolve: jest.fn() });
    expect(result).toBeNull();
  });
});
