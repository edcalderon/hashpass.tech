import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ActionButton, FormField } from '@hashpass/ui/primitives';
import { useSettings } from '../settings/SettingsContext';
import type { SmaSetupProps } from './types';

export function SmaSetup({onComplete, onDismiss, error}: SmaSetupProps) {
  const {t, isDark} = useSettings();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    await onComplete(email);
    setSubmitting(false);
  };

  return (
    <main className="sma-gate">
      <section className="card sma-gate__card" aria-labelledby="sma-setup-title">
        <p className="eyebrow">{t('sma.setup.eyebrow')}</p>
        <h1 id="sma-setup-title" className="h2">{t('sma.setup.title')}</h1>
        <p className="lead">{t('sma.setup.lead')}</p>
        <form className="sma-form" onSubmit={submit}>
          <FormField
            mode={isDark ? 'dark' : 'light'}
            label={t('sma.setup.emailLabel')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
            accessibilityHint={t('sma.setup.emailNote')}
          />
          <p id="companion-email-note" className="muted">{t('sma.setup.emailNote')}</p>
          {error && <p className="sma-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary btn--block" disabled={submitting || !email.trim()}>
            {submitting ? t('sma.setup.creating') : t('sma.setup.submit')}
          </button>
        </form>
        <ActionButton mode={isDark ? 'dark' : 'light'} variant="ghost" label={t('sma.setup.skip')} onPress={onDismiss} />
      </section>
    </main>
  );
}
