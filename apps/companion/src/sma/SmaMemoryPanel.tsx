import { useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../Pixel';
import { useSettings } from '../settings/SettingsContext';
import type { SmaMemoryInput, SmaMemoryPanelProps } from './types';

export function SmaMemoryPanel({archive, onRemember, onReset, onExport, error}: SmaMemoryPanelProps) {
  const {t} = useSettings();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: SmaMemoryInput = {
      type: 'preference',
      content,
      epistemicStatus: 'instructed',
      scope: 'user',
      sensitivity: 'private',
      confidence: 1,
      provenanceMethod: 'user-statement',
    };
    setSaving(true);
    await onRemember(input);
    setContent('');
    setSaving(false);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([onExport()], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'companion-sma-0.1.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    if (window.confirm(t('sma.memory.deleteConfirm'))) onReset();
  };

  return (
    <section className="section section--tint" id="memory" aria-labelledby="memory-title">
      <div className="wrap">
        <p className="eyebrow">{t('sma.memory.eyebrow')}</p>
        <h2 id="memory-title" className="h2">{t('sma.memory.title')}</h2>
        <p className="lead">{t('sma.memory.lead')}</p>
        <div className="sma-panel card">
          <div>
            <p className="stage__num"><Icon name="star" /> {archive.manifest.agent.name}</p>
            <p className="muted">{archive.records.length} {archive.records.length === 1 ? t('sma.memory.localOne') : t('sma.memory.localMany')} · {t('sma.memory.soul')} v{archive.manifest.soul.version} · {t('sma.memory.root')} {archive.manifest.memory.sequence}</p>
            <code className="sma-id">{archive.manifest.agent.did}</code>
          </div>
          <form className="sma-form" onSubmit={submit}>
            <label htmlFor="companion-memory">{t('sma.memory.label')}</label>
            <textarea id="companion-memory" value={content} onChange={(event) => setContent(event.target.value)} rows={3} placeholder={t('sma.memory.placeholder')} />
            <button type="submit" className="btn btn--primary" disabled={saving || !content.trim()}>{saving ? t('sma.memory.saving') : t('sma.memory.save')}</button>
          </form>
          {archive.records.length > 0 && (
            <ul className="sma-records" aria-label={t('sma.memory.recent')}>
              {archive.records.slice(-3).reverse().map((record) => <li key={record.id}><strong>{record.content}</strong><span className="muted">{record.epistemicStatus} · {record.lifecycle.status}</span></li>)}
            </ul>
          )}
          {error && <p className="sma-error" role="alert">{error}</p>}
          <div className="sma-actions">
            <button type="button" className="btn btn--tint" onClick={download}>{t('sma.memory.export')}</button>
            <button type="button" className="link" onClick={reset}>{t('sma.memory.delete')}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
