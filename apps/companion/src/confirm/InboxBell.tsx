import { useEffect, useRef, useState } from 'react';
import { ActionButton, Badge, FormField } from '@hashpass/ui/primitives';
import { Icon } from '../Pixel';
import { useSettings } from '../settings/SettingsContext';
import type { InboxBellProps } from './types';

/** Top-bar inbox. An unconfirmed email shows here as a notice; the Companion keeps working either way. */
export function InboxBell({ items, ownerEmail, status, errorKey, onSend, onVerify }: InboxBellProps) {
  const { t, isDark } = useSettings();
  const mode = isDark ? 'dark' : 'light';
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const unconfirmed = items.some((item) => item.kind === 'unconfirmed-email');
  const busy = status === 'sending' || status === 'verifying';

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!unconfirmed) setCode('');
  }, [unconfirmed]);

  return (
    <div className="inbox" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="inbox__trigger settings-trigger"
        aria-label={items.length ? t('inbox.openCount', { n: items.length }) : t('inbox.open')}
        aria-expanded={open}
        aria-controls="companion-inbox"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="bell" />
        {items.length > 0 && <span className="inbox__count" aria-hidden="true">{items.length}</span>}
      </button>
      {open && (
        <div id="companion-inbox" className="inbox__panel" role="dialog" aria-label={t('inbox.title')} tabIndex={-1} ref={panel}>
          <div className="inbox__head">
            <h2 className="h3">{t('inbox.title')}</h2>
            <ActionButton mode={mode} variant="ghost" label={t('inbox.close')} onPress={() => { setOpen(false); trigger.current?.focus(); }} />
          </div>
          {items.length === 0 && <p className="muted">{t('inbox.empty')}</p>}
          <ul className="inbox__list">
            {items.map((item) => (
              <li key={`${item.kind}-${item.email ?? ''}`} className={`inbox__item inbox__item--${item.kind}`}>
                <div className="inbox__item-head">
                  <Badge mode={mode} tone={item.kind === 'unconfirmed-email' ? 'accent' : 'neutral'} compact>
                    {t(item.kind === 'unconfirmed-email' ? 'inbox.badge.action' : 'inbox.badge.info')}
                  </Badge>
                  <strong>{t(`inbox.${item.kind}.title`)}</strong>
                </div>
                <p className="muted">{t(`inbox.${item.kind}.body`, { email: item.email ?? '' })}</p>
                {item.kind === 'unconfirmed-email' && ownerEmail && (
                  <div className="inbox__confirm">
                    <ActionButton
                      mode={mode}
                      variant="secondary"
                      label={t(status === 'sending' ? 'confirm.sending' : status === 'sent' ? 'confirm.resend' : 'confirm.send')}
                      onPress={() => void onSend()}
                      disabled={busy}
                    />
                    {(status === 'sent' || status === 'verifying') && (
                      <>
                        <p className="muted" role="status">{t('confirm.sent', { email: ownerEmail })}</p>
                        <FormField
                          mode={mode}
                          label={t('confirm.codeLabel')}
                          value={code}
                          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                          keyboardType="number-pad"
                          autoComplete="one-time-code"
                          maxLength={6}
                          returnKeyType="done"
                          onSubmitEditing={() => void onVerify(code)}
                        />
                        <ActionButton
                          mode={mode}
                          label={t(status === 'verifying' ? 'confirm.verifying' : 'confirm.verify')}
                          onPress={() => void onVerify(code)}
                          disabled={busy || code.length !== 6}
                        />
                      </>
                    )}
                    {errorKey && <p className="sma-error" role="alert">{t(errorKey)}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
