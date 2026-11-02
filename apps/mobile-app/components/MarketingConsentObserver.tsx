import { useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../lib/api-client';
import {
  clearPendingSignupMarketingConsent,
  readPendingSignupMarketingConsent,
} from '../lib/marketing-consent-pending';

const wait = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

export default function MarketingConsentObserver() {
  const { user, isLoggedIn } = useAuth();
  const syncInFlight = useRef(false);

  useEffect(() => {
    if (!user?.id || !isLoggedIn || syncInFlight.current) return;
    let cancelled = false;
    syncInFlight.current = true;

    const syncConsent = async () => {
      try {
        const pending = await readPendingSignupMarketingConsent();
        if (!pending || cancelled) return;

        const signedInEmail = user.email?.trim().toLowerCase();
        if (pending.email && signedInEmail && pending.email !== signedInEmail) {
          await clearPendingSignupMarketingConsent();
          return;
        }

        for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
          const response = await apiClient.post(
            'marketing/consent',
            {
              consentVersion: pending.consentVersion,
              hashpassUpdates: pending.hashpassUpdates,
              partnerPromotions: pending.partnerPromotions,
              requestId: pending.requestId,
            },
            { skipEventSegment: true, retries: 0 },
          );
          if (response.success) {
            await clearPendingSignupMarketingConsent();
            return;
          }
          if (attempt < 2) await wait(600 * (attempt + 1));
        }
      } catch (error) {
        console.warn('[marketing/consent] signup opt-in could not be recorded:', error);
      } finally {
        syncInFlight.current = false;
      }
    };

    void syncConsent();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user?.email, user?.id]);

  return null;
}
