import { useEffect, useRef, useState } from 'react';
import { ActionButton, Badge } from '@hashpass/ui/primitives';
import { Icon } from '../Pixel';
import { useSettings } from '../settings/SettingsContext';
import { downloadArchive } from './model';
import type { AccountMenuProps, AccountSummary } from './types';

function Avatar({ summary, large }: { summary: AccountSummary; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const showImage = summary.image && !failed;
  return (
    <span className={`avatar${large ? ' avatar--large' : ''}`} aria-hidden="true">
      {showImage ? <img src={summary.image} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : summary.initials}
    </span>
  );
}

/** Top-bar profile picture. It opens the account page: who is connected, how, and what is stored here. */
export function AccountMenu({ summary, signedIn, onSignIn, onSignOut, onExport, onReset }: AccountMenuProps) {
  const { t, isDark } = useSettings();
  const mode = isDark ? 'dark' : 'light';
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const page = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    page.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="account__trigger settings-trigger"
        aria-label={t('account.open', { name: summary.displayName })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Avatar summary={summary} />
      </button>
      {open && (
        <div className="account__backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className="account card" role="dialog" aria-modal="true" aria-labelledby="account-title" tabIndex={-1} ref={page}>
            <div className="account__head">
              <Avatar summary={summary} large />
              <div className="account__who">
                <h2 id="account-title" className="h3">{summary.displayName}</h2>
                <p className="muted">{summary.email}</p>
              </div>
              <ActionButton mode={mode} variant="ghost" label={t('account.close')} onPress={close} />
            </div>

            <section aria-labelledby="account-ids">
              <p id="account-ids" className="control-plane__label"><Icon name="lock" /> {t('account.identities')}</p>
              <ul className="account__list">
                {summary.identities.map((identity) => (
                  <li key={`${identity.kind}-${identity.email}`} className="account__row">
                    <div>
                      <strong>{t(`account.kind.${identity.kind}`)}</strong>
                      <p className="muted">{identity.email}</p>
                    </div>
                    <Badge mode={mode} tone={identity.status === 'unconfirmed' ? 'neutral' : 'accent'} compact>
                      {t(`account.status.${identity.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
              {summary.identities.some((identity) => identity.status === 'unconfirmed') && (
                <p className="muted account__hint">{t('account.confirmHint')}</p>
              )}
            </section>

            <section aria-labelledby="account-data">
              <p id="account-data" className="control-plane__label"><Icon name="book" /> {t('account.data')}</p>
              {summary.archiveId ? (
                <dl className="control-plane__facts">
                  <div><dt>{t('account.archive')}</dt><dd><code className="control-plane__id">{summary.archiveId}</code></dd></div>
                  <div><dt>{t('account.memories')}</dt><dd>{summary.memoryCount}</dd></div>
                  <div><dt>{t('account.storage')}</dt><dd>{t('account.storage.local')}</dd></div>
                </dl>
              ) : (
                <p className="muted">{t('account.noArchive')}</p>
              )}
              <p className="muted account__hint">{t('account.privacy')}</p>
            </section>

            <div className="account__actions">
              {summary.archiveId && (
                <ActionButton mode={mode} variant="secondary" label={t('control.export.cta')} leadingIcon={<Icon name="download" />} onPress={() => downloadArchive(onExport())} />
              )}
              {signedIn ? (
                <ActionButton mode={mode} variant="secondary" label={t('control.auth.signOut')} onPress={() => { close(); void onSignOut(); }} />
              ) : (
                <ActionButton mode={mode} label={t('control.auth.cta')} onPress={() => void onSignIn()} />
              )}
              {summary.archiveId && (
                <ActionButton
                  mode={mode}
                  variant="ghost"
                  label={t('account.delete')}
                  onPress={() => { if (window.confirm(t('sma.memory.deleteConfirm'))) { close(); onReset(); } }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
