const HEX = /^#([0-9a-f]{6})$/i;

const channels = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/**
 * Opaque blend of `foreground` over `base` at `alpha` (0-1). Unlike an 8-digit hex tint it
 * never lets what is underneath show through, so a chip that grows over text stays legible.
 * Falls back to `foreground` when either colour is not `#rrggbb`.
 */
export function mixHex(foreground: string, base: string, alpha: number): string {
  if (!HEX.test(foreground) || !HEX.test(base)) return foreground;
  const fg = channels(foreground);
  const bg = channels(base);
  const mixed = fg.map((channel, index) => Math.round(channel * alpha + bg[index] * (1 - alpha)));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
