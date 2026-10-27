import { useCallback, useEffect, useRef, useState } from 'react';
import { localeInfo } from '@hashpass/ui/settings';
import { Icon, Sprite } from '../Pixel';
import { useSettings } from '../settings/SettingsContext';
import { cancelSpeech, speak, voiceStatus } from '../voice';
import { filmScenes, readingMs } from './scenes';

/**
 * A short narrated intro: one scene at a time with captions that always show the same words as the voice.
 * Nothing plays until the viewer presses Play (also what lets the browser allow speech). Voice is optional.
 */
export function IntroFilm({ onClose, onStartQuest }: { onClose: () => void; onStartQuest: () => void }) {
  const { settings, t, setVoice } = useSettings();
  const dialogEl = useRef<HTMLDialogElement | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const scene = filmScenes[index];
  const line = t(`film.${scene.id}.line`);
  const tag = localeInfo(settings.language).speechTag;
  const canSpeak = voiceStatus(tag) === 'ok';
  const speaking = settings.voice && canSpeak;

  useEffect(() => {
    const el = dialogEl.current;
    if (el && !el.open) el.showModal();
    return () => {
      cancelSpeech();
      if (el?.open) el.close();
    };
  }, []);

  const goNext = useCallback(() => {
    if (index >= filmScenes.length - 1) {
      setPlaying(false);
      setEnded(true);
    } else {
      setIndex(index + 1);
    }
  }, [index]);

  // Plays the current scene: narrate it if voice is on, otherwise hold the caption long enough to read.
  useEffect(() => {
    if (!playing) {
      cancelSpeech();
      return undefined;
    }
    let timer = 0;
    const after = (ms: number) => {
      timer = window.setTimeout(goNext, ms);
    };
    if (speaking) {
      const ok = speak(line, { lang: tag, onEnd: () => after(700) });
      if (!ok) after(readingMs(line, settings.language));
    } else {
      after(readingMs(line, settings.language));
    }
    return () => {
      window.clearTimeout(timer);
      cancelSpeech();
    };
  }, [playing, index, speaking, line, tag, settings.language, goNext]);

  const jump = (next: number) => {
    setEnded(false);
    setIndex(Math.max(0, Math.min(filmScenes.length - 1, next)));
  };
  const replay = () => {
    setIndex(0);
    setEnded(false);
    setPlaying(true);
  };

  return (
    <dialog
      ref={dialogEl}
      className="quest film"
      aria-labelledby="film-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="quest__bar">
        <p id="film-title" className="quest__title">
          {t('film.title')} · {t('film.scene', { n: index + 1, total: filmScenes.length })}
        </p>
        <button type="button" className="btn btn--ghost quest__close" onClick={onClose}>
          {t('film.close')}
        </button>
      </div>

      <div className="film__stage" data-scene={scene.id} data-playing={playing ? 'true' : 'false'}>
        <div className="film__art" aria-hidden="true">
          <Sprite name={scene.sprite} className="pet film__pet" />
          <span className="film__badge"><Icon name={scene.icon} /></span>
        </div>
        <h2 className="h2 film__heading">{t(`film.${scene.id}.title`)}</h2>
        <p className="film__caption" role="status" aria-live="polite" aria-label={t('film.captions')}>
          {line}
        </p>
        <ol className="film__dots" aria-hidden="true">
          {filmScenes.map((s, i) => (
            <li key={s.id} className={i === index ? 'is-now' : i < index ? 'is-past' : ''} />
          ))}
        </ol>
      </div>

      <div className="film__controls">
        <button type="button" className="btn btn--tint" onClick={() => jump(index - 1)} disabled={index === 0}>
          {t('film.prev')}
        </button>
        {ended ? (
          <button type="button" className="btn btn--tint" onClick={replay}>
            {t('film.replay')}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => setPlaying((p) => !p)} autoFocus>
            {playing ? t('film.pause') : t('film.play')}
          </button>
        )}
        <button type="button" className="btn btn--tint" onClick={() => jump(index + 1)} disabled={index === filmScenes.length - 1}>
          {t('film.next')}
        </button>
        <button type="button" className="btn btn--tint" aria-pressed={speaking} disabled={!canSpeak} onClick={() => setVoice(!settings.voice)}>
          {speaking ? t('film.voiceOn') : t('film.voiceOff')}
        </button>
        {(ended || index === filmScenes.length - 1) && (
          <button type="button" className="btn btn--play" onClick={onStartQuest}>
            <span className="btn__tri" aria-hidden="true" /> {t('film.start')}
          </button>
        )}
      </div>
    </dialog>
  );
}
