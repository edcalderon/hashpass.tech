import { useCallback, useEffect, useRef, useState } from 'react';
import { localeInfo } from '@hashpass/ui/settings';
import { Sprite } from '../Pixel';
import { useSettings } from '../settings/SettingsContext';
import { cancelSpeech, speak } from '../voice';
import type { Dialog, Game, Hud, Phase, StageKey } from '../types';
import { advance, answer, openDialog } from './dialog';
import { completeQuest, createGame, talkState, tickGame } from './engine';
import { levels } from './levels';
import { createPixelMusic } from './music';
import { VIEW_H, VIEW_W, drawGame } from './render';

const STEP_MS = 1000 / 60;
const stageOrder: StageKey[] = ['hatchling', 'curious', 'helpful'];

export function QuestGame({ onClose }: { onClose: () => void }) {
  const { settings, t } = useSettings();
  const tag = localeInfo(settings.language).speechTag;
  const dialogEl = useRef<HTMLDialogElement | null>(null);
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game>(createGame(levels[0]));
  const keys = useRef({ left: false, right: false, jump: false });
  const phaseRef = useRef<Phase>('intro');
  const stageRef = useRef<StageKey>('hatchling');
  const musicRef = useRef(createPixelMusic());
  const musicInteracted = useRef(false);

  const [levelIndex, setLevelIndex] = useState(0);
  const [phase, setPhaseState] = useState<Phase>('intro');
  const [stage, setStage] = useState<StageKey>('hatchling');
  const [talk, setTalk] = useState<Dialog>(openDialog());
  const [hud, setHud] = useState<Hud>({ collected: 0, need: 0, near: false, state: 'locked', falls: 0 });
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.22);

  const level = levels[levelIndex];
  const lv = (suffix: string) => t(`level.${level.id}.${suffix}`);
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  useEffect(() => {
    const el = dialogEl.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  useEffect(() => () => musicRef.current.dispose(), []);

  const startMusic = () => {
    musicInteracted.current = true;
    void musicRef.current.start().then(
      () => setMusicPlaying(true),
      () => setMusicPlaying(false),
    );
  };

  const toggleMusic = () => {
    musicInteracted.current = true;
    if (musicPlaying) {
      musicRef.current.stop();
      setMusicPlaying(false);
    } else {
      startMusic();
    }
  };

  const startLevel = useCallback(
    (index: number) => {
      gameRef.current = createGame(levels[index]);
      keys.current = { left: false, right: false, jump: false };
      setLevelIndex(index);
      setTalk(openDialog());
      setPhase('intro');
    },
    [setPhase],
  );

  const beginPlay = () => {
    if (!musicInteracted.current) startMusic();
    setPhase('play');
    canvasEl.current?.focus();
  };

  const openTalk = useCallback(() => {
    const g = gameRef.current;
    if (!g.nearNpc || phaseRef.current !== 'play') return;
    setTalk(openDialog());
    setPhase('talk');
  }, [setPhase]);

  // Game loop: fixed 60 Hz simulation, drawing every animation frame.
  useEffect(() => {
    const canvas = canvasEl.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHud = '';
    const frame = (now: number) => {
      const g = gameRef.current;
      acc = Math.min(acc + (now - last), 250);
      last = now;
      if (phaseRef.current === 'play') {
        while (acc >= STEP_MS) {
          const k = keys.current;
          tickGame(g, { dir: k.left === k.right ? 0 : k.left ? -1 : 1, jump: k.jump });
          acc -= STEP_MS;
          if (g.finished) break;
        }
        if (g.finished) {
          setPhase(levelIndex === levels.length - 1 ? 'end' : 'cleared');
        }
      } else {
        acc = 0;
      }
      drawGame(ctx, g, stageRef.current, now);
      const snapshot: Hud = { collected: g.collected, need: g.level.needTokens, near: g.nearNpc, state: talkState(g), falls: g.falls };
      const sig = `${snapshot.collected}|${snapshot.near}|${snapshot.state}|${snapshot.falls}`;
      if (sig !== lastHud) {
        lastHud = sig;
        setHud(snapshot);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [levelIndex, setPhase]);

  // Keyboard.
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current;
      let handled = true;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          k.left = down;
          break;
        case 'ArrowRight':
        case 'KeyD':
          k.right = down;
          break;
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
          k.jump = down;
          break;
        case 'KeyE':
        case 'Enter':
          if (down && !e.repeat && phaseRef.current === 'play') openTalk();
          else handled = phaseRef.current === 'play';
          break;
        default:
          handled = false;
      }
      if (handled && phaseRef.current === 'play') e.preventDefault();
    };
    const dn = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
    };
  }, [openTalk]);

  const hold = (key: 'left' | 'right' | 'jump') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      keys.current[key] = true;
    },
    onPointerUp: () => {
      keys.current[key] = false;
    },
    onPointerCancel: () => {
      keys.current[key] = false;
    },
    onLostPointerCapture: () => {
      keys.current[key] = false;
    },
  });

  const step = level.npcSteps[talk.step];
  const finishTalk = () => {
    const g = gameRef.current;
    completeQuest(g);
    if (level.rewardStage) {
      stageRef.current = level.rewardStage;
      setStage(level.rewardStage);
    }
    setPhase('play');
    canvasEl.current?.focus();
  };

  const stateNow = talkState(gameRef.current);
  const pickedReply = talk.picked !== null ? lv(`s${talk.step}.r${talk.picked}`) : null;
  const talkLine = (() => {
    if (stateNow === 'locked') return lv('locked');
    if (stateNow === 'done') return lv('done');
    return pickedReply ?? lv(`s${talk.step}`);
  })();

  // Voice-over: read the line the quest giver is showing right now, when the player turned voice on.
  useEffect(() => {
    if (phase !== 'talk' || !settings.voice) return undefined;
    speak(talkLine, { lang: tag });
    return () => cancelSpeech();
  }, [phase, settings.voice, talkLine, tag]);

  const nextLevel = levels[levelIndex + 1];

  return (
    <dialog
      ref={dialogEl}
      className="quest"
      aria-labelledby="quest-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="quest__bar">
        <p id="quest-title" className="quest__title">
          {t('quest.title', { n: levelIndex + 1, total: levels.length, title: lv('title') })}
        </p>
        <ol className="quest__stages" aria-label={t('stage.aria')}>
          {stageOrder.map((s) => (
            <li key={s} className={s === stage ? 'is-now' : stageOrder.indexOf(s) < stageOrder.indexOf(stage) ? 'is-past' : ''} aria-current={s === stage ? 'step' : undefined}>
              {t(`stage.${s}.name`)}
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn--ghost quest__close" onClick={onClose}>
          {t('quest.close')}
        </button>
      </div>

      <div className="quest__stage">
        <canvas
          ref={canvasEl}
          className="quest__canvas"
          width={VIEW_W}
          height={VIEW_H}
          tabIndex={0}
          role="img"
          aria-label={t('quest.canvas', { n: levelIndex + 1, title: lv('title'), objective: lv('objective') })}
        />

        <div className="quest__hud" aria-live="polite">
          <span>{lv('objective')}</span>
          {level.needTokens > 0 && (
            <strong>
              {Math.min(hud.collected, level.needTokens)} / {level.needTokens} {lv('token')}
            </strong>
          )}
          {hud.state === 'done' && <strong className="ok">{t('quest.flagOpen')}</strong>}
        </div>

        <div className="quest__audio" aria-label={t('quest.musicControls')}>
          <button type="button" className="quest__audio-toggle" aria-pressed={musicPlaying} onClick={toggleMusic}>
            <span aria-hidden="true">♫</span> {musicPlaying ? t('quest.musicOn') : t('quest.musicOff')}
          </button>
          <label className="quest__volume">
            <span>{t('quest.volume')}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={musicVolume}
              aria-label={t('quest.volume')}
              onChange={(e) => {
                const next = Number(e.currentTarget.value);
                setMusicVolume(next);
                musicRef.current.setVolume(next);
              }}
            />
          </label>
        </div>

        {phase === 'intro' && (
          <div className="quest__panel" role="group" aria-label={t('quest.briefing')}>
            <p className="eyebrow">{lv('badge')}</p>
            <h2 className="h2">{lv('title')}</h2>
            <p className="lead">{lv('teaches')}</p>
            <p>{lv('objective')}</p>
            <div className="quest__control-guide" aria-label={t('quest.controls')}>
              <p className="quest__control-title">{t('quest.controlsTitle')}</p>
              <div className="quest__control-grid">
                <div className="quest__control-item">
                  <div className="quest__keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd><kbd>A</kbd><kbd>D</kbd></div>
                  <span>{t('quest.move')}</span>
                </div>
                <div className="quest__control-item">
                  <div className="quest__keys" aria-hidden="true"><kbd>SPACE</kbd><kbd>↑</kbd></div>
                  <span>{t('quest.jump')}</span>
                </div>
                <div className="quest__control-item">
                  <div className="quest__keys" aria-hidden="true"><kbd>E</kbd><kbd>ENTER</kbd></div>
                  <span>{t('quest.talk')}</span>
                </div>
              </div>
              <p className="muted quest__touch-note">{t('quest.touchHint')}</p>
              <p className="muted quest__music-note"><span aria-hidden="true">♫</span> {t('quest.musicHint')}</p>
            </div>
            <button type="button" className="btn btn--primary" onClick={beginPlay} autoFocus>
              {levelIndex === 0 ? t('quest.start') : t('quest.go')}
            </button>
          </div>
        )}

        {phase === 'talk' && (
          <div className="quest__panel quest__panel--talk" role="group" aria-label={t('quest.says', { name: lv('npc') })}>
            <p className="eyebrow">{lv('npc')}</p>
            <p className="quest__say" role="status" aria-live="polite">
              {talkLine}
            </p>
            {stateNow === 'ready' && step?.choices && !talk.right && (
              <div className="quest__choices">
                {step.choices.map((_, i) => (
                  <button key={i} type="button" className="btn btn--tint" onClick={() => setTalk((d) => answer(level, d, i))} autoFocus={i === 0}>
                    {lv(`s${talk.step}.c${i}`)}
                  </button>
                ))}
              </div>
            )}
            {stateNow === 'ready' && talk.picked !== null && !talk.right && <p className="muted">{t('quest.tryAgain')}</p>}
            <div className="quest__row">
              {stateNow !== 'ready' && (
                <button type="button" className="btn btn--primary" onClick={() => setPhase('play')} autoFocus>
                  {t('quest.back')}
                </button>
              )}
              {stateNow === 'ready' && (talk.right || (step && !step.choices)) && (
                <button
                  type="button"
                  className="btn btn--primary"
                  autoFocus
                  onClick={() => {
                    const next = advance(level, talk);
                    if (next.done) finishTalk();
                    else setTalk(next);
                  }}
                >
                  {talk.step === level.npcSteps.length - 1 ? t('quest.done') : t('quest.next')}
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'cleared' && (
          <div className="quest__panel" role="group" aria-label={t('quest.cleared')}>
            <p className="eyebrow">{t('quest.cleared')}</p>
            <h2 className="h2">{lv('title')}</h2>
            {level.rewardStage && <p className="lead">{t('quest.grew', { stage: t(`stage.${level.rewardStage}.name`) })}</p>}
            {!level.rewardStage && <p className="lead">{t('quest.nextUp', { title: t(`level.${nextLevel?.id}.title`) })}</p>}
            {hud.falls > 0 && <p className="muted">{t('quest.falls', { n: hud.falls })}</p>}
            <button type="button" className="btn btn--primary" onClick={() => startLevel(levelIndex + 1)} autoFocus>
              {t('quest.nextQuest')}
            </button>
          </div>
        )}

        {phase === 'end' && (
          <div className="quest__panel" role="group" aria-label={t('quest.endEyebrow')}>
            <p className="eyebrow">{t('quest.endEyebrow')}</p>
            <h2 className="h2">{t('quest.endTitle')}</h2>
            <div className="quest__final">
              <Sprite name={stage} className="pet pet--card" />
              <p className="lead">{t('quest.endBody')}</p>
            </div>
            <div className="quest__row">
              <button type="button" className="btn btn--primary" disabled aria-describedby="quest-id-note">
                {t('quest.endId')}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => startLevel(0)}>
                {t('quest.again')}
              </button>
              <button type="button" className="btn btn--ghost" onClick={onClose} autoFocus>
                {t('quest.backPage')}
              </button>
            </div>
            <p id="quest-id-note" className="muted">{t('quest.endNote')}</p>
          </div>
        )}
      </div>

      <div className="quest__pad" aria-label={t('quest.pad')}>
        <div className="quest__pad-move">
          <button type="button" className="pad" aria-label={t('quest.left')} {...hold('left')}>◀</button>
          <button type="button" className="pad" aria-label={t('quest.right')} {...hold('right')}>▶</button>
        </div>
        <div className="quest__pad-act">
          {hud.near && phase === 'play' && (
            <button type="button" className="pad pad--talk" onClick={openTalk}>
              {t('quest.talk')}
            </button>
          )}
          <button type="button" className="pad pad--jump" aria-label={t('quest.jump')} {...hold('jump')}>▲</button>
        </div>
      </div>
    </dialog>
  );
}
