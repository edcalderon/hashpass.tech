import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SignupMarketingConsent } from './types/marketing-consent.types';
import { SIGNUP_MARKETING_CONSENT_VERSION } from './marketing-consent-policy';

const PENDING_SIGNUP_MARKETING_CONSENT_KEY = 'hashpass.signup-marketing-consent.pending';
const PENDING_CONSENT_TTL_MS = 15 * 60 * 1000;

export async function stageSignupMarketingConsent(
  consent: SignupMarketingConsent,
  email?: string | null,
) {
  if (!consent.hashpassUpdates && !consent.partnerPromotions) {
    await AsyncStorage.removeItem(PENDING_SIGNUP_MARKETING_CONSENT_KEY);
    return;
  }

  const normalizedEmail = email?.trim().toLowerCase() || null;
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(
    PENDING_SIGNUP_MARKETING_CONSENT_KEY,
    JSON.stringify({
      ...consent,
      consentVersion: SIGNUP_MARKETING_CONSENT_VERSION,
      createdAt: Date.now(),
      email: normalizedEmail,
      requestId,
    }),
  );
}

export async function readPendingSignupMarketingConsent() {
  const pending = await AsyncStorage.getItem(PENDING_SIGNUP_MARKETING_CONSENT_KEY);
  if (!pending) return null;

  try {
    const record = JSON.parse(pending);
    const createdAt = Number(record?.createdAt);
    if (
      record?.consentVersion !== SIGNUP_MARKETING_CONSENT_VERSION ||
      (record?.hashpassUpdates !== true && record?.partnerPromotions !== true) ||
      !Number.isFinite(createdAt) ||
      Date.now() - createdAt > PENDING_CONSENT_TTL_MS ||
      typeof record?.requestId !== 'string' ||
      record.requestId.length < 3
    ) {
      await AsyncStorage.removeItem(PENDING_SIGNUP_MARKETING_CONSENT_KEY);
      return null;
    }

    return {
      consentVersion: SIGNUP_MARKETING_CONSENT_VERSION,
      hashpassUpdates: record.hashpassUpdates === true,
      partnerPromotions: record.partnerPromotions === true,
      email: typeof record.email === 'string' ? record.email.trim().toLowerCase() : null,
      requestId: record.requestId,
    };
  } catch {
    await AsyncStorage.removeItem(PENDING_SIGNUP_MARKETING_CONSENT_KEY);
    return null;
  }
}

export async function clearPendingSignupMarketingConsent() {
  await AsyncStorage.removeItem(PENDING_SIGNUP_MARKETING_CONSENT_KEY);
}
