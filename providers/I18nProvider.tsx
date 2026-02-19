import React, { useEffect, useState, useRef } from 'react';
import { I18nProvider as LinguiI18nProvider, useLingui } from '@lingui/react';
import { i18n, initI18n, loadMessages } from '../i18n/i18n';
import { useLanguage } from '../providers/LanguageProvider';

function I18nProviderInner({ children }: { children: React.ReactNode }) {
  const { locale: targetLocale } = useLanguage?.() || { locale: undefined } as any;
  const { i18n: linguiI18n } = useLingui();
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const lastLocaleRef = useRef<string>(linguiI18n.locale);

  // Update locale when target locale changes
  useEffect(() => {
    if (targetLocale && targetLocale !== linguiI18n.locale) {
      loadMessages(targetLocale)
        .then(() => {
          // Trigger a state update to ensure context propagates to child components
          // This doesn't remount, just triggers re-renders
          lastLocaleRef.current = linguiI18n.locale;
          setUpdateTrigger(prev => prev + 1);
        })
        .catch(() => {});
    }
  }, [targetLocale, linguiI18n.locale]);

  // Subscribe to linguiI18n.locale changes to catch any external updates
  useEffect(() => {
    // Only update if locale actually changed
    if (linguiI18n.locale !== lastLocaleRef.current) {
      lastLocaleRef.current = linguiI18n.locale;
      setUpdateTrigger(prev => prev + 1);
    }
  }, [linguiI18n.locale]);

  // No remounting - just re-rendering with updated translations
  // Components using useLingui will re-render when locale changes
  // The updateTrigger state ensures React knows to re-render this component
  // which propagates the updated locale through context to child components
  return <>{children}</>;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => setReady(true)).catch(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <LinguiI18nProvider i18n={i18n}>
      <I18nProviderInner>
        {children}
      </I18nProviderInner>
    </LinguiI18nProvider>
  );
}
