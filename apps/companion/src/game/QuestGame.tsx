import { useCallback, useEffect, useRef, useState } from 'react';
import { Sprite } from '../Pixel';
import type { Dialog, Game, Hud, Phase, StageKey } from '../types';
import { advance, answer, openDialog } from './dialog';
import { completeQuest, createGame, talkState, tickGame } from './engine';
import { levels } from './levels';
import { VIEW_H, VIEW_W, drawGame } from './render';

const STEP_MS = 1000 / 60;
const stageOrder: StageKey[] = ['hatchling', 'curious', 'helpful'];

export function QuestGame({ onClose }: { onClose: () => void }) {
  const dialogEl = useRef<HTMLDialogElement | null>(null);
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game>(createGame(levels[0]));
  const keys = useRef({ left: false, right: false, jump: false });
  const phaseRef = useRef<Phase>('intro');
  const stageRef = useRef<StageKey>('hatchling');

  const [levelIndex, setLevelIndex] = useState(0);
  const [phase, setPhaseState] = useState<Phase>('intro');
  const [stage, setStage] = useState<StageKey>('hatchling');
  const [talk, setTalk] = useState<Dialog>(openDialog());
  const [hud, setHud] = useState<Hud>({ collected: 0, need: 0, near: false, state: 'locked', falls: 0 });

  const level = levels[levelIndex];
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

  const talkLine = () => {
    const g = gameRef.current;
    const state = talkState(g);
    if (state === 'locked') return level.npcLockedSay;
    if (state === 'done') return level.npcDoneSay;
    return step?.say ?? '';
  };

  const stateNow = talkState(gameRef.current);
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
          Quest {levelIndex + 1} of {levels.length} · {level.title}
        </p>
        <ol className="quest__stages" aria-label="Pet stage">
          {stageOrder.map((s) => (
            <li key={s} className={s === stage ? 'is-now' : stageOrder.indexOf(s) < stageOrder.indexOf(stage) ? 'is-past' : ''} aria-current={s === stage ? 'step' : undefined}>
              {s}
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn--ghost quest__close" onClick={onClose}>
          Close
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
          aria-label={`Platformer level ${levelIndex + 1}: ${level.title}. ${level.objective} Use arrow keys or A and D to move, Space to jump, E to talk.`}
        />

        <div className="quest__hud" aria-live="polite">
          <span>{level.objective}</span>
          {level.needTokens > 0 && (
            <strong>
              {Math.min(hud.collected, level.needTokens)} / {level.needTokens} {level.tokenLabel}
            </strong>
          )}
          {hud.state === 'done' && <strong className="ok">Flag open</strong>}
        </div>

        {phase === 'intro' && (
          <div className="quest__panel" role="group" aria-label="Level briefing">
            <p className="eyebrow">{level.badge}</p>
            <h2 className="h2">{level.title}</h2>
            <p className="lead">{level.teaches}.</p>
            <p>{level.objective}</p>
            <p className="muted">Arrow keys or A / D to move, Space to jump, E to talk. On a phone use the buttons below.</p>
            <button type="button" className="btn btn--primary" onClick={beginPlay} autoFocus>
              {levelIndex === 0 ? 'Start playing' : 'Go'}
            </button>
          </div>
        )}

        {phase === 'talk' && (
          <div className="quest__panel quest__panel--talk" role="group" aria-label={`${level.npcName} says`}>
            <p className="eyebrow">{level.npcName}</p>
            <p className="quest__say" role="status" aria-live="polite">
              {stateNow === 'ready' ? (talk.feedback ?? step?.say ?? '') : talkLine()}
            </p>
            {stateNow === 'ready' && step?.choices && !talk.right && (
              <div className="quest__choices">
                {step.choices.map((c, i) => (
                  <button key={c.label} type="button" className="btn btn--tint" onClick={() => setTalk((d) => answer(level, d, i))} autoFocus={i === 0}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {stateNow === 'ready' && talk.feedback && !talk.right && <p className="muted">Try again.</p>}
            <div className="quest__row">
              {stateNow !== 'ready' && (
                <button type="button" className="btn btn--primary" onClick={() => setPhase('play')} autoFocus>
                  Back to the map
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
                  {talk.step === level.npcSteps.length - 1 ? 'Done' : 'Next'}
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'cleared' && (
          <div className="quest__panel" role="group" aria-label="Level complete">
            <p className="eyebrow">Level complete</p>
            <h2 className="h2">{level.title}</h2>
            {level.rewardStage && <p className="lead">Your pet grew into <strong>{level.rewardStage}</strong>.</p>}
            {!level.rewardStage && <p className="lead">Nicely done. Next up: {nextLevel?.title}.</p>}
            {hud.falls > 0 && <p className="muted">Falls: {hud.falls}. Nobody is counting.</p>}
            <button type="button" className="btn btn--primary" onClick={() => startLevel(levelIndex + 1)} autoFocus>
              Next quest
            </button>
          </div>
        )}

        {phase === 'end' && (
          <div className="quest__panel" role="group" aria-label="Tutorial complete">
            <p className="eyebrow">Tutorial complete</p>
            <h2 className="h2">Flag captured</h2>
            <div className="quest__final">
              <Sprite name={stage} className="pet pet--card" />
              <p className="lead">
                That was a short showcase. The real Companion is not live yet: this page is a staging preview, nothing you did here was saved or sent, and
                sign-in is not connected.
              </p>
            </div>
            <div className="quest__row">
              <button type="button" className="btn btn--primary" disabled aria-describedby="quest-id-note">
                Continue with HASHPASS ID
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => startLevel(0)}>
                Play again
              </button>
              <button type="button" className="btn btn--ghost" onClick={onClose} autoFocus>
                Back to the page
              </button>
            </div>
            <p id="quest-id-note" className="muted">Sign-in is not connected on this preview.</p>
          </div>
        )}
      </div>

      <div className="quest__pad" aria-label="Touch controls">
        <div className="quest__pad-move">
          <button type="button" className="pad" aria-label="Move left" {...hold('left')}>◀</button>
          <button type="button" className="pad" aria-label="Move right" {...hold('right')}>▶</button>
        </div>
        <div className="quest__pad-act">
          {hud.near && phase === 'play' && (
            <button type="button" className="pad pad--talk" onClick={openTalk}>
              Talk
            </button>
          )}
          <button type="button" className="pad pad--jump" aria-label="Jump" {...hold('jump')}>▲</button>
        </div>
      </div>
    </dialog>
  );
}
