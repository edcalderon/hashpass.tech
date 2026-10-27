import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { icons } from './icons';
import { sprites } from './sprites';
import type { IconKey, SpriteKey } from './types';

/** Draws a sprite as merged horizontal runs of crisp SVG rects. Decorative: the parent names it. */
export function Sprite({ name, className }: { name: SpriteKey; className?: string }) {
  const sprite = sprites[name];
  const runs = useMemo(() => {
    const out: { x: number; y: number; w: number; ch: string }[] = [];
    sprite.rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        let w = 1;
        while (x + w < row.length && row[x + w] === ch) w += 1;
        if (ch !== '.') out.push({ x, y, w, ch });
        x += w;
      }
    });
    return out;
  }, [sprite]);
  const palette = sprite.palette as Record<string, string>;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${sprite.rows[0].length} ${sprite.rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {runs.map((r) => (
        <rect key={`${r.x}-${r.y}`} className={r.ch === 'p' ? 'eye' : undefined} x={r.x} y={r.y} width={r.w} height={1} fill={palette[r.ch]} />
      ))}
    </svg>
  );
}

const glyphs: Record<string, string[]> = {
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
};

/** Bitmap wordmark in a hand-built 5x7 font, so the page needs no web font request. */
export function PixelWord({ text, className }: { text: string; className?: string }) {
  const cells = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    [...text].forEach((letter, i) => {
      (glyphs[letter] ?? []).forEach((row, y) => {
        [...row].forEach((bit, x) => {
          if (bit === '1') out.push({ x: i * 6 + x, y });
        });
      });
    });
    return out;
  }, [text]);
  const width = text.length * 6 - 1;
  return (
    <svg className={className} viewBox={`0 0 ${width + 1} 8`} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <g className="word-shadow" transform="translate(1 1)">
        {cells.map((c) => (
          <rect key={`s${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} />
        ))}
      </g>
      <g className="word-face">
        {cells.map((c) => (
          <rect key={`f${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} />
        ))}
      </g>
    </svg>
  );
}

/** Deterministic star field so server and client render the same sky. */
export function Stars({ count = 46 }: { count?: number }) {
  const stars = useMemo(() => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    return Array.from({ length: count }, (_, i) => ({
      left: `${(next() * 100).toFixed(1)}%`,
      top: `${(next() * 62).toFixed(1)}%`,
      big: next() > 0.8,
      twinkle: i % 4 === 0,
      delay: `${(next() * 3).toFixed(1)}s`,
    }));
  }, [count]);
  return (
    <div className="stars" aria-hidden="true">
      {stars.map((s, i) => (
        <span key={i} className={`star${s.big ? ' star--big' : ''}${s.twinkle ? ' star--twinkle' : ''}`} style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
      ))}
    </div>
  );
}

/** True while the element is on screen, so looping animation can pause when it is not. */
export function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, inView] as const;
}

/** One-colour pixel icon in the current text colour. Decorative: the label next to it carries the meaning. */
export function Icon({ name, className }: { name: IconKey; className?: string }) {
  const rects = useMemo(
    () => icons[name].flatMap((row, y) => [...row].map((c, x) => (c === '1' ? { x, y } : null)).filter((c): c is { x: number; y: number } => c !== null)),
    [name],
  );
  return (
    <svg className={`icon${className ? ` ${className}` : ''}`} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * Fades a block in the first time it scrolls into view. Content is visible by default; the hidden state is only
 * applied (before paint) when IntersectionObserver exists, so nothing stays invisible if the observer never fires.
 * Reduced motion is handled in CSS, which shows everything immediately.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    node.dataset.reveal = 'hide';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.dataset.reveal = 'show';
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}
