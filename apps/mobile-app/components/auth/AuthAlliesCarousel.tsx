import React, { Children, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const CARD_WIDTH = 190;
const GAP = 14;
const css = `
@keyframes auth-allies-loop { to { transform: translateX(-50%); } }
.auth-allies-track { display: flex; width: max-content; animation: auth-allies-loop linear infinite; }
.auth-allies-carousel:hover .auth-allies-track,
.auth-allies-carousel:focus-within .auth-allies-track { animation-play-state: paused; }
.auth-allies-control { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid currentColor; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; opacity: .75; }
.auth-allies-control:hover { opacity: 1; }
.auth-allies-control:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .auth-allies-track { animation: none; } }
`;

export default function AuthAlliesCarousel({
  children, enabled, pauseLabel, resumeLabel, color,
}: {
  children: React.ReactNode[];
  enabled: boolean;
  pauseLabel: string;
  resumeLabel: string;
  color: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [paused, setPaused] = useState(false);
  const items = Children.toArray(children);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const resize = () => setWidth(node.clientWidth);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const animated = enabled && !reducedMotion && items.length > 1 && width > 0;
  const repeats = Math.max(1, Math.ceil(width / Math.max(1, items.length * (CARD_WIDTH + GAP))));
  const cycleWidth = repeats * items.length * (CARD_WIDTH + GAP);

  return (
    <div className="auth-allies-carousel" data-animated={animated} style={{ width: "100%", position: "relative", color }}>
      <style>{css}</style>
      {animated && (
        <button className="auth-allies-control" type="button" title={paused ? resumeLabel : pauseLabel}
          aria-label={paused ? resumeLabel : pauseLabel} aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
          style={{ position: "absolute", right: 0, top: -36 }}>
          {paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
        </button>
      )}
      <div ref={viewport} data-testid="auth-allies-viewport" style={{ overflow: "hidden", padding: "16px 0 28px", margin: "-8px -12px 0", width: "calc(100% + 24px)", maskImage: animated ? "linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)" : undefined }}>
        {animated ? (
          <div className="auth-allies-track" style={{ animationDuration: `${cycleWidth / 28}s`, animationPlayState: paused ? "paused" : undefined }}>
            {[0, 1].map((group) => (
              <div key={group} aria-hidden={group === 1 ? true : undefined} inert={group === 1 ? true : undefined}
                style={{ display: "flex", gap: GAP, paddingRight: GAP, flexShrink: 0 }}>
                {Array.from({ length: repeats }, (_, repeat) => (
                  <div key={repeat} aria-hidden={repeat > 0 ? true : undefined} inert={repeat > 0 ? true : undefined}
                    style={{ display: "flex", gap: GAP, flexShrink: 0 }}>
                    {items}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: GAP, padding: "0 12px" }}>{items}</div>
        )}
      </div>
    </div>
  );
}
