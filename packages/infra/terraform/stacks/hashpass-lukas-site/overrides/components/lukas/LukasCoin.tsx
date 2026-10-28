import React, { useRef } from 'react';
import './LukasCoin.css';
import type { LukasCoinProps } from '../../types/lukas.types';
import { useSceneActivity } from './useLukasMotion';

const currencies = [
  { code: 'brl', name: 'Brazilian real', position: 'brl' },
  { code: 'mxn', name: 'Mexican peso', position: 'mxn' },
  { code: 'cop', name: 'Colombian peso', position: 'cop' },
  { code: 'clp', name: 'Chilean peso', position: 'clp' },
  { code: 'ars', name: 'Argentine peso', position: 'ars' },
];

// Brand illustration: original protocol SVGs, layered in a web-only 3D scene.
export function LukasCoin({ size = 220, animationLevel = 'full' }: LukasCoinProps) {
  const scene = useRef<HTMLDivElement>(null);
  useSceneActivity(scene);

  return (
    <div ref={scene} className="lukas-scene" data-active="false" data-motion={animationLevel} style={{ width: size * 1.6, height: size * 1.6 }}>
      <div className="lukas-scene__halo" aria-hidden="true" />
      <div className="lukas-scene__ring lukas-scene__ring--outer" aria-hidden="true" />
      <div className="lukas-scene__ring lukas-scene__ring--inner" aria-hidden="true" />
      <div className="lukas-scene__shadow" aria-hidden="true" />
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
