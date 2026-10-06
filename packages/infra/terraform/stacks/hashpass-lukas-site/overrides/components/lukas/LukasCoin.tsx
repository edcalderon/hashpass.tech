import React, { useEffect, useRef } from 'react';
import './LukasCoin.css';

export interface LukasCoinProps { size?: number; }

const currencies = [
  { code: 'brl', name: 'Brazilian real', position: 'brl' },
  { code: 'mxn', name: 'Mexican peso', position: 'mxn' },
  { code: 'cop', name: 'Colombian peso', position: 'cop' },
  { code: 'clp', name: 'Chilean peso', position: 'clp' },
  { code: 'ars', name: 'Argentine peso', position: 'ars' },
];

// Brand illustration: original protocol SVGs, layered in a web-only 3D scene.
export function LukasCoin({ size = 220 }: LukasCoinProps) {
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    let visible = false;
    const update = () => { element.dataset.active = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);

  return (
    <div ref={scene} className="lukas-scene" data-active="false" style={{ width: size * 1.6, height: size * 1.6 }}>
      <div className="lukas-scene__halo" aria-hidden="true" />
      <div className="lukas-scene__ring lukas-scene__ring--outer" aria-hidden="true" />
      <div className="lukas-scene__ring lukas-scene__ring--inner" aria-hidden="true" />
      <div className="lukas-scene__core">
        <img className="lukas-scene__coin" src="/coins/lukas-coin.svg" alt="LUKAS coin" width="512" height="512" draggable={false} />
      </div>
      {currencies.map(({ code, name, position }) => (
        <div key={code} className={`lukas-scene__satellite lukas-scene__satellite--${position}`}>
          <img src={`/coins/${code}-coin.svg`} alt={name} width="512" height="512" draggable={false} />
        </div>
      ))}
    </div>
  );
}
