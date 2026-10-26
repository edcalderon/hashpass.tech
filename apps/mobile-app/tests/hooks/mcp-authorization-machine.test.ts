import {
  createMcpAuthorizationActor,
  getMcpAuthorizationView,
} from '../../hooks/mcp-authorization-machine';

describe('mcp authorization machine', () => {
  it('should require sign-in for an anonymous user with a valid authorization request', () => {
    const actor = createMcpAuthorizationActor({
      flow: 'consent',
      request: { isValid: true, isExpired: false },
    });

    actor.start();
    actor.send({ type: 'SESSION_ANONYMOUS' });

    const view = getMcpAuthorizationView(actor.getSnapshot());

    expect(view.phase).toBe('signInRequired');
    expect(view.canSubmitConsent).toBe(false);
    expect(view.canRedirectToAuthorization).toBe(false);

    actor.stop();
  });

  it('should stop an expired authorization request before consent or redirect', () => {
    const actor = createMcpAuthorizationActor({
      flow: 'consent',
      request: { isValid: true, isExpired: true },
    });

    actor.start();

    const view = getMcpAuthorizationView(actor.getSnapshot());

    expect(view.phase).toBe('expired');
    expect(view.canSubmitConsent).toBe(false);
    expect(view.canRedirectToAuthorization).toBe(false);

    actor.stop();
  });

  it('should allow authorization redirect only after login session authentication', () => {
    const actor = createMcpAuthorizationActor({
      flow: 'login',
      request: { isValid: true, isExpired: false },
    });

    actor.start();
    expect(getMcpAuthorizationView(actor.getSnapshot()).canRedirectToAuthorization).toBe(false);

    actor.send({ type: 'SESSION_AUTHENTICATED' });

    const view = getMcpAuthorizationView(actor.getSnapshot());

    expect(view.phase).toBe('authorizationRedirect');
    expect(view.canRedirectToAuthorization).toBe(true);
    expect(view.canSubmitConsent).toBe(false);

    actor.stop();
  });

  it('should enable consent submission only after authenticated consent metadata verification', () => {
    const actor = createMcpAuthorizationActor({
      flow: 'consent',
      request: { isValid: true, isExpired: false },
    });

    actor.start();
    actor.send({ type: 'SESSION_AUTHENTICATED' });

    expect(getMcpAuthorizationView(actor.getSnapshot()).canSubmitConsent).toBe(false);

    actor.send({ type: 'CONSENT_VERIFIED' });

    const view = getMcpAuthorizationView(actor.getSnapshot());

    expect(view.phase).toBe('consentReady');
    expect(view.canSubmitConsent).toBe(true);
    expect(view.canRedirectToAuthorization).toBe(false);

    actor.stop();
  });
});
