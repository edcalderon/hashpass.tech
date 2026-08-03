export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// Brand bumper lengths.
export const INTRO_FRAMES = 90; // 3s
export const OUTRO_FRAMES = 90; // 3s

// Placeholder length reserved per clip slot until a real recording lands.
// Real clips extend their own Sequence to the recording's actual duration
// (see RecordingSlot's `durationInFrames` override).
export const CLIP_FRAMES = 150; // 5s

export const BRAND = {
  black: '#0a0a0a',
  white: '#ffffff',
  accentCyan: '#4dd8ff',
};
