import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCompanionAuthBaseUrl } from '../auth/client';
import { useSettings } from '../settings/SettingsContext';
import { addConfirmed, buildInbox, callConfirmation, CODE_PATTERN, confirmationEndpoint, takeConfirmToken } from './model';
import { loadConfirmedEmails, saveConfirmedEmails } from './storage';
import type { ConfirmStatus } from './types';

/**
 * Optional email confirmation for the local setup email. The six-digit code expires; the link
 * in the same message does not. Either one only records, in this browser, that the address was
 * proven. Nothing here gates the Companion or creates an account.
 */
export function useEmailConfirmation(ownerEmail: string | null) {
  const { settings } = useSettings();
  const [confirmedEmails, setConfirmedEmails] = useState<string[]>(() => loadConfirmedEmails());
  const [linkConfirmedEmail, setLinkConfirmedEmail] = useState<string | null>(null);
  const [linkFailed, setLinkFailed] = useState(false);
  const [status, setStatus] = useState<ConfirmStatus>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const endpoint = useMemo(() => confirmationEndpoint(getCompanionAuthBaseUrl()), []);

  const markConfirmed = useCallback((email: string) => {
    setConfirmedEmails((current) => {
      const next = addConfirmed(current, email);
      if (next !== current) saveConfirmedEmails(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const { token, cleanHref } = takeConfirmToken(window.location.href);
    if (token === null && cleanHref === window.location.href) return;
    window.history.replaceState(null, '', cleanHref);
    if (!token) return;
    void callConfirmation(endpoint, { action: 'verify-link', token }).then((result) => {
      if (result.ok && result.email) {
        markConfirmed(result.email);
        setLinkConfirmedEmail(result.email);
      } else {
        setLinkFailed(true);
      }
    });
  }, [endpoint, markConfirmed]);

  const send = useCallback(async () => {
    if (!ownerEmail) return;
    setStatus('sending');
    setErrorKey(null);
    const result = await callConfirmation(endpoint, { action: 'send', email: ownerEmail, locale: settings.language });
    setStatus(result.ok ? 'sent' : 'idle');
    if (!result.ok) setErrorKey(result.errorKey);
  }, [endpoint, ownerEmail, settings.language]);

  const verify = useCallback(async (code: string) => {
    if (!ownerEmail) return;
    if (!CODE_PATTERN.test(code)) {
      setErrorKey('confirm.error.format');
      return;
    }
    setStatus('verifying');
    setErrorKey(null);
    const result = await callConfirmation(endpoint, { action: 'verify-code', email: ownerEmail, code });
    if (result.ok) {
      markConfirmed(ownerEmail);
      setLinkConfirmedEmail(ownerEmail);
      setStatus('idle');
    } else {
      setStatus('sent');
      setErrorKey(result.errorKey);
    }
  }, [endpoint, markConfirmed, ownerEmail]);

  const items = useMemo(
    () => buildInbox({ ownerEmail, confirmedEmails, linkConfirmedEmail, linkFailed }),
    [ownerEmail, confirmedEmails, linkConfirmedEmail, linkFailed],
  );

  return { items, status, errorKey, send, verify };
}
