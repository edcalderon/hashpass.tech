/**
 * Quest-giver conversation as a small state machine. Wrong answers explain and let the player try again, so a
 * quiz can never trap anyone; the only way forward is the correct answer, and every step has exactly one.
 */
import type { Dialog, LevelDef } from '../types.ts';

export const openDialog = (): Dialog => ({ step: 0, feedback: null, right: false, done: false });

export function answer(level: LevelDef, d: Dialog, choiceIndex: number): Dialog {
  const choice = level.npcSteps[d.step]?.choices?.[choiceIndex];
  if (!choice || d.right || d.done) return d;
  return { ...d, feedback: choice.reply, right: choice.correct };
}

/** Moves past a choiceless step or a correctly answered one. */
export function advance(level: LevelDef, d: Dialog): Dialog {
  const step = level.npcSteps[d.step];
  if (d.done || !step) return { ...d, done: true };
  if (step.choices && !d.right) return d;
  const next = d.step + 1;
  return { step: next, feedback: null, right: false, done: next >= level.npcSteps.length };
}
