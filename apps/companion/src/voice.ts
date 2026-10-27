/**
 * Voice-over through the browser's built-in speech synthesis. Nothing is recorded or sent anywhere: the text is
 * spoken by whatever voice the device already has, so quality varies and some devices have no voice for a
 * language. Callers must treat speech as optional and always show the same words as captions.
 */
import type { SpeakOptions, VoiceStatus } from './types';

const engine = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

const base = (tag: string) => tag.toLowerCase().split('-')[0];

export function findVoice(tag: string): SpeechSynthesisVoice | null {
  const synth = engine();
  if (!synth) return null;
  const voices = synth.getVoices();
  return voices.find((v) => v.lang.toLowerCase() === tag.toLowerCase()) ?? voices.find((v) => base(v.lang) === base(tag)) ?? null;
}

export function voiceStatus(tag: string): VoiceStatus {
  if (!engine()) return 'unsupported';
  return findVoice(tag) ? 'ok' : 'novoice';
}

export function cancelSpeech(): void {
  engine()?.cancel();
}

/** Speaks `text`, replacing anything already being spoken. Returns false when nothing could be spoken. */
export function speak(text: string, { lang, onEnd }: SpeakOptions): boolean {
  const synth = engine();
  const voice = findVoice(lang);
  if (!synth || !voice || !text) return false;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 0.96;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  synth.speak(utterance);
  return true;
}

export function onVoicesChanged(listener: () => void): () => void {
  const synth = engine();
  if (!synth) return () => undefined;
  synth.addEventListener('voiceschanged', listener);
  return () => synth.removeEventListener('voiceschanged', listener);
}
