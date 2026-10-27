import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSettings } from '../settings/SettingsContext';
import type { SmaSetupProps } from './types';

export function SmaSetup({onComplete, error}: SmaSetupProps) {
  const {t} = useSettings();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
          <label htmlFor="companion-email">{t('sma.setup.emailLabel')}</label>
          <input
            id="companion-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            aria-describedby="companion-email-note"
          />
          <p id="companion-email-note" className="muted">{t('sma.setup.emailNote')}</p>
          {error && <p className="sma-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? t('sma.setup.creating') : t('sma.setup.submit')}
          </button>
        </form>
      </section>
    </main>
  );
}
