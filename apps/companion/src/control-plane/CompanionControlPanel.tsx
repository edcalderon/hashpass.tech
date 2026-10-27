import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ActionButton, Badge, FormField, Surface } from '@hashpass/ui/primitives';
import { Icon } from '../Pixel';
import { useSettings } from '../settings/SettingsContext';
import { createControlPlaneModel, createDraftCompanion } from './model';
import type { CompanionCardProps, CompanionControlPanelProps } from './types';

function downloadArchive(serialized: string) {
  const url = URL.createObjectURL(new Blob([serialized], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'companion-sma-0.1.json';
  link.click();
  URL.revokeObjectURL(url);
}

function CompanionCard({companion}: CompanionCardProps) {
  const {t, isDark} = useSettings();
  const mode = isDark ? 'dark' : 'light';
  return (
    <li>
      <Surface mode={mode}>
      <div className="control-plane__companion">
      <div className="control-plane__companion-mark" aria-hidden="true"><Icon name={companion.role === 'manager' ? 'star' : 'book'} /></div>
      <div className="control-plane__companion-main">
        <div className="control-plane__companion-heading">
          <div>
            <h4 className="h3">{companion.name}</h4>
            <p className="muted">{t(`control.companion.role.${companion.role}`)}</p>
          </div>
          <Badge mode={mode} tone={companion.status === 'active' ? 'accent' : 'neutral'} compact>
            {t(`control.companion.status.${companion.status}`)}
          </Badge>
        </div>
        <dl className="control-plane__facts">
          <div><dt>{t('control.companion.controller')}</dt><dd>{t(`control.companion.controller.${companion.controller}`)}</dd></div>
          <div><dt>{t('control.companion.memory')}</dt><dd>{t(`control.companion.sma.${companion.sma}`)}</dd></div>
          <div><dt>{t('control.companion.scope')}</dt><dd>{t(`control.companion.scope.${companion.scope}`)}</dd></div>
        </dl>
        <code className="control-plane__id">{companion.id}</code>
      </div>
      </div>
      </Surface>
    </li>
  );
}

export function CompanionControlPanel({archive, onExport, auth, onSignIn, onSignOut, onRetryAuth}: CompanionControlPanelProps) {
  const {t, isDark} = useSettings();
  const mode = isDark ? 'dark' : 'light';
  const model = useMemo(() => createControlPlaneModel(archive), [archive]);
  const [companions, setCompanions] = useState(model.companions);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('Coder Companion');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setCompanions(model.companions);
    setShowCreate(false);
    setNotice('');
  }, [model]);

  const slotsRemaining = model.plan.included - companions.length;
  const createCompanion = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || slotsRemaining <= 0) return;
    setCompanions((current) => [...current, createDraftCompanion(trimmed, current.length + 1)]);
    setName('Coder Companion');
    setShowCreate(false);
    setNotice(t('control.create.notice'));
  };

  return (
    <section className="section section--control" id="dashboard" aria-labelledby="control-title">
      <div className="wrap">
        <div className="control-plane__intro">
          <div>
            <p className="eyebrow">{t('control.eyebrow')}</p>
            <h2 id="control-title" className="h2">{t('control.title')}</h2>
            <p className="lead">{t('control.lead')}</p>
          </div>
          <span className="control-plane__preview"><span className="tag__dot" aria-hidden="true" /> {t('control.preview')}</span>
        </div>

        <div className="control-plane__overview">
          <div className="card control-plane__overview-card">
            <p className="control-plane__label"><Icon name="star" /> {t('control.workspace.label')}</p>
            <h3 className="h3">{t(`control.workspace.name.${model.workspaceName}`)}</h3>
            <p className="muted">{t('control.workspace.body')}</p>
          </div>
          <div className="card control-plane__overview-card">
            <p className="control-plane__label"><Icon name="book" /> {t('control.project.label')}</p>
            <h3 className="h3">{t(`control.project.name.${model.projectName}`)}</h3>
            <p className="muted">{t('control.project.body')}</p>
          </div>
          <div className="card control-plane__overview-card control-plane__quota">
            <p className="control-plane__label"><Icon name="lock" /> {t('control.plan.label')}</p>
            <h3 className="h3">{t(`control.plan.${model.plan.name}`)}</h3>
            <p className="muted">{t('control.plan.count', {used: companions.length, max: model.plan.included})}</p>
            <div className="control-plane__quota-bar" role="progressbar" aria-valuemin={0} aria-valuemax={model.plan.included} aria-valuenow={companions.length} aria-label={t('control.plan.count', {used: companions.length, max: model.plan.included})}>
              <span style={{width: `${Math.min(100, (companions.length / model.plan.included) * 100)}%`}} />
            </div>
            <p className="control-plane__fineprint">{t('control.plan.proposed')}</p>
          </div>
        </div>

        <div className="control-plane__grid">
          <div className="card control-plane__fleet">
            <div className="control-plane__section-heading">
              <div>
                <p className="control-plane__label">{t('control.fleet.label')}</p>
                <h3 className="h3">{t('control.fleet.title')}</h3>
              </div>
              <ActionButton mode={mode} variant="secondary" label={t('control.create.button')} leadingIcon={<Icon name="star" />} onPress={() => setShowCreate((current) => !current)} disabled={slotsRemaining <= 0} />
            </div>
            <p className="muted control-plane__fleet-lead">{t('control.fleet.lead')}</p>
            <ul className="control-plane__companions" aria-label={t('control.fleet.title')}>
              {companions.map((companion) => <CompanionCard key={companion.id} companion={companion} />)}
            </ul>
            {showCreate && (
              <form onSubmit={createCompanion}>
               <Surface mode={mode}>
                <div className="control-plane__create">
                <div>
                  <p className="control-plane__label">{t('control.create.eyebrow')}</p>
                  <h4 className="h3">{t('control.create.title')}</h4>
                  <p className="muted">{t('control.create.body')}</p>
                </div>
                <FormField mode={mode} label={t('control.create.name')} value={name} onChangeText={setName} onSubmitEditing={() => createCompanion()} returnKeyType="done" />
                <div className="control-plane__create-actions">
                  <ActionButton mode={mode} label={t('control.create.submit')} leadingIcon={<Icon name="check" />} onPress={() => createCompanion()} disabled={!name.trim()} />
                  <ActionButton mode={mode} variant="ghost" label={t('control.create.cancel')} onPress={() => setShowCreate(false)} />
                </div>
                </div>
               </Surface>
              </form>
            )}
            {notice && <p className="control-plane__notice" role="status">{notice}</p>}
          </div>

          <aside className="card control-plane__auth" aria-labelledby="auth-boundary-title">
            <p className="control-plane__label"><Icon name="lock" /> {t('control.auth.label')}</p>
            <h3 id="auth-boundary-title" className="h3">{t('control.auth.title')}</h3>
            <p className="muted">{t('control.auth.body')}</p>
            <ul className="control-plane__checks">
              <li><Icon name="check" /> {t('control.auth.check1')}</li>
              <li><Icon name="check" /> {t('control.auth.check2')}</li>
              <li><Icon name="clock" /> {t('control.auth.check3')}</li>
            </ul>
            <p className={`control-plane__auth-state control-plane__auth-state--${auth.status}`} role={auth.status === 'error' ? 'alert' : undefined}>
              {t(`control.auth.state.${auth.status}`)}
            </p>
            {auth.status === 'loading' && <p className="muted" role="status">{t('control.auth.checking')}</p>}
            {auth.status === 'error' && (
              <>
                <p className="control-plane__auth-error">{auth.error || t('control.auth.error')}</p>
                <ActionButton mode={mode} variant="secondary" label={t('control.auth.retry')} onPress={() => void onRetryAuth()} />
              </>
            )}
            {auth.status === 'signed-out' && (
              <ActionButton mode={mode} label={t('control.auth.cta')} onPress={() => void onSignIn()} />
            )}
            {auth.status === 'signed-in' && auth.user && (
              <div className="control-plane__identity">
                <strong>{auth.user.name || auth.user.email}</strong>
                <code>{auth.user.email}</code>
                <ActionButton mode={mode} variant="secondary" label={t('control.auth.signOut')} onPress={() => void onSignOut()} />
              </div>
            )}
            <p className="muted control-plane__fineprint">{t('control.auth.note')}</p>
            <div className="control-plane__export">
              <div>
                <p className="control-plane__label">{t('control.export.label')}</p>
                <p className="muted">{t('control.export.body')}</p>
              </div>
              <ActionButton mode={mode} variant="secondary" label={t('control.export.cta')} onPress={() => downloadArchive(onExport())} />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
