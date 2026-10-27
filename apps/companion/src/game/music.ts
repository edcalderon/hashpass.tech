/**
 * A tiny procedural cinematic score for the quest preview. Keeping the track in
 * code means the demo has no media request, and the browser can start it only
 * after the player has interacted with the page.
 */
export function createPixelMusic() {
  const tempo = 78;
  const stepDuration = 60 / tempo / 2;
  const melody = [523.25, 0, 587.33, 659.25, 783.99, 0, 659.25, 587.33, 523.25, 0, 440, 523.25, 587.33, 0, 659.25, 783.99, 698.46, 0, 659.25, 587.33, 523.25, 0, 493.88, 523.25, 587.33, 0, 659.25, 587.33, 523.25, 0, 440, 0];
  const chords = [
    [261.63, 329.63, 392, 493.88],
    [246.94, 293.66, 392, 493.88],
    [220, 261.63, 329.63, 392],
    [174.61, 220, 261.63, 329.63],
  ];
  const bass = [130.81, 123.47, 110, 87.31];
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let timer: number | null = null;
  let nextStep = 0;
  let step = 0;
  let playing = false;
  let volume = 0.22;

  const ensureContext = () => {
    if (context && master) return context;
    const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error('Web Audio is not supported');
    context = new AudioContextConstructor();
    master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
    return context;
  };

  const tone = (frequency: number, when: number, duration: number, level: number, type: OscillatorType) => {
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(level, when + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.03);
  };

  const schedule = () => {
    if (!context) return;
    while (nextStep < context.currentTime + 0.12) {
      const melodyNote = melody[step];
      const chord = chords[Math.floor(step / 8) % chords.length];
      if (step % 8 === 0) {
        chord.forEach((note, index) => tone(note, nextStep + index * 0.018, stepDuration * 7.6, 0.018, 'sine'));
        tone(bass[Math.floor(step / 8) % bass.length], nextStep, stepDuration * 7.4, 0.08, 'triangle');
      }
      if (melodyNote) tone(melodyNote, nextStep, stepDuration * 0.86, 0.055, 'triangle');
      if (step % 4 === 2) tone(melodyNote || chord[2] * 2, nextStep, stepDuration * 0.32, 0.018, 'sine');
      nextStep += stepDuration;
      step = (step + 1) % melody.length;
    }
  };

  return {
    async start() {
      const audio = ensureContext();
      if (playing) return;
      await audio.resume();
      playing = true;
      step = 0;
      nextStep = audio.currentTime + 0.05;
      master?.gain.setTargetAtTime(volume, audio.currentTime, 0.02);
      schedule();
      timer = window.setInterval(schedule, 50);
    },
    stop() {
      playing = false;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      if (context && master) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(0.0001, context.currentTime, 0.03);
      }
    },
    setVolume(next: number) {
      volume = Math.min(1, Math.max(0, next));
      if (context && master) {
        master.gain.setTargetAtTime(volume, context.currentTime, 0.02);
      }
    },
    dispose() {
      const audio = context;
      this.stop();
      context = null;
      master = null;
      if (audio) void audio.close();
    },
  };
}
