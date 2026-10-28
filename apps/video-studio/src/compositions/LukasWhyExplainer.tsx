import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {
  LUKAS_WHY_COPY,
  LUKAS_WHY_DURATION_IN_FRAMES,
} from '../content/lukas-why';
import type {
  LukasWhyCoinProps,
  LukasWhyCurrencyOrbitProps,
  LukasWhyExplainerProps,
  LukasWhyOrbitRingProps,
} from '../types/LukasWhy.types';

const MIDNIGHT = '#06111E';
const MINT = '#7EE6A0';
const GREEN = '#36C66B';
const SKY = '#8EEBFF';
const GOLD = '#F5C451';

const coinFiles: Record<string, string> = {
  BRL: 'brl-coin.svg',
  MXN: 'mxn-coin.svg',
  COP: 'cop-coin.svg',
  CLP: 'clp-coin.svg',
  ARS: 'ars-coin.svg',
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const Coin: React.FC<LukasWhyCoinProps> = ({code, size, x, y, rotation, progress, isCentral = false}) => {
  const source = isCentral ? 'lukas-coin.svg' : coinFiles[code];
  const wobble = Math.sin(progress * Math.PI * 2 + rotation) * (isCentral ? 2 : 7);
  const scale = interpolate(clamp(progress), [0, 1], [0.35, 1]);
  const tilt = Math.sin(progress * Math.PI * 2 + rotation) * (isCentral ? 4 : 16);
  const layers = isCentral ? 7 : 4;

  return (
    <div
      style={{
        height: size,
        left: x - size / 2,
        opacity: clamp(progress),
        position: 'absolute',
        top: y - size / 2,
        transform: `perspective(900px) rotateY(${tilt}deg) rotateZ(${wobble}deg) scale(${scale})`,
        transformOrigin: 'center',
        width: size,
        zIndex: isCentral ? 4 : 3,
      }}
    >
      {Array.from({length: layers}, (_, layer) => (
        <Img
          key={layer}
          src={staticFile(`lukas/coins/${source}`)}
          style={{
            filter: layer === 0 ? 'drop-shadow(0 26px 28px rgba(0,0,0,.42))' : 'brightness(.62)',
            height: size,
            left: layer === 0 ? 0 : -layer * 2,
            objectFit: 'contain',
            position: 'absolute',
            top: layer === 0 ? 0 : layer * 4,
            width: size,
            zIndex: layers - layer,
          }}
        />
      ))}
    </div>
  );
};

const OrbitRing: React.FC<LukasWhyOrbitRingProps> = ({size, opacity, rotation}) => (
  <div
    style={{
      border: `2px solid rgba(126, 230, 160, ${opacity})`,
      borderRadius: '50%',
      height: size * 0.58,
      left: '50%',
      position: 'absolute',
      top: '49%',
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      width: size,
    }}
  />
);

const CurrencyOrbit: React.FC<LukasWhyCurrencyOrbitProps> = ({copy, frame}) => {
  const {fps} = useVideoConfig();
  const entrance = clamp((frame - 28) / 45);
  const orbitProgress = (frame - 46) / (fps * 12);
  const centerX = 960;
  const centerY = 474;
  const radiusX = 390;
  const radiusY = 225;

  return (
    <>
      <OrbitRing size={860} opacity={0.3} rotation={frame * 0.03} />
      <OrbitRing size={720} opacity={0.18} rotation={-frame * 0.04} />
      {copy.currencies.map((currency, index) => {
        const angle = -Math.PI / 2 + index * ((Math.PI * 2) / copy.currencies.length) + orbitProgress * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radiusX;
        const y = centerY + Math.sin(angle) * radiusY;
        const reveal = clamp(entrance - index * 0.1);
        return (
          <React.Fragment key={currency.code}>
            <Coin code={currency.code} size={150} x={x} y={y} rotation={index} progress={reveal} />
            <div
              style={{
                background: 'rgba(6, 17, 30, .82)',
                border: '1px solid rgba(142, 235, 255, .42)',
                borderRadius: 999,
                color: '#F5FFFA',
                fontSize: 22,
                fontWeight: 800,
                left: x - 53,
                opacity: clamp(reveal - 0.12),
                padding: '9px 14px',
                position: 'absolute',
                textAlign: 'center',
                top: y + 85,
                width: 106,
              }}
            >
              {currency.code} · {currency.weight}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

export const LukasWhyExplainer: React.FC<LukasWhyExplainerProps> = ({locale = 'en'}) => {
  const frame = useCurrentFrame();
  const copy = LUKAS_WHY_COPY[locale] ?? LUKAS_WHY_COPY.en;
  const narrationLocale = LUKAS_WHY_COPY[locale] ? locale : 'en';
  const {fps} = useVideoConfig();
  const titleIn = clamp(frame / 26);
  const titleOut = interpolate(frame, [LUKAS_WHY_DURATION_IN_FRAMES - 30, LUKAS_WHY_DURATION_IN_FRAMES], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const indexIn = clamp((frame - 80) / 32);
  const finalIn = clamp((frame - 228) / 38);
  const centralIn = clamp((frame - 10) / 30);
  const pulse = 1 + Math.sin((frame / fps) * Math.PI * 2) * 0.018;

  return (
    <AbsoluteFill style={{backgroundColor: MIDNIGHT, color: '#F5FFFA', fontFamily: 'Arial, sans-serif', overflow: 'hidden'}}>
      <Audio src={staticFile('audio/music/elegant-bed.mp3')} volume={0.1} />
      <Sequence from={18}>
        <Audio src={staticFile(`audio/narration/lukas-why/${narrationLocale}.mp3`)} volume={0.95} />
      </Sequence>
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 44%, rgba(54,198,107,.22), transparent 33%), radial-gradient(circle at 18% 82%, rgba(142,235,255,.14), transparent 30%), linear-gradient(135deg, #06111E 0%, #0A2733 100%)'}} />
      <div style={{background: `linear-gradient(90deg, transparent, ${GREEN}, transparent)`, height: 2, left: 0, opacity: 0.55, position: 'absolute', top: 74, width: '100%'}} />
      <div style={{left: 100, opacity: titleOut, position: 'absolute', right: 100, top: 78, transform: `translateY(${interpolate(titleIn, [0, 1], [26, 0])}px)`}}>
        <div style={{color: MINT, fontSize: 24, fontWeight: 800, letterSpacing: 4}}>{copy.eyebrow}</div>
        <div style={{color: '#F5FFFA', fontSize: 53, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.08, marginTop: 14, maxWidth: 1080}}>{copy.title}</div>
      </div>
      <CurrencyOrbit copy={copy} frame={frame} />
      <Coin code="LUKAS" size={315} x={960} y={474} rotation={0} progress={centralIn} isCentral />
      <div style={{background: 'rgba(6,17,30,.96)', border: `1px solid rgba(126,230,160,.6)`, borderRadius: 999, boxShadow: '0 18px 46px rgba(0,0,0,.28)', color: MINT, fontSize: 29, fontWeight: 800, left: '50%', opacity: indexIn, padding: '14px 28px', position: 'absolute', top: 704, transform: `translateX(-50%) scale(${interpolate(indexIn, [0, 1], [.82, pulse])})`, whiteSpace: 'nowrap', zIndex: 10}}>
        <span style={{color: SKY}}>●</span> {copy.indexLine}
      </div>
      <div style={{alignItems: 'center', bottom: 76, display: 'flex', flexDirection: 'column', left: 100, opacity: finalIn, position: 'absolute', right: 100, transform: `translateY(${interpolate(finalIn, [0, 1], [26, 0])}px)`}}>
        <div style={{color: '#F5FFFA', fontSize: 31, fontWeight: 700, textAlign: 'center'}}>{copy.backingLine}</div>
        <div style={{color: GOLD, fontSize: 20, fontWeight: 800, letterSpacing: 3, marginTop: 16, textTransform: 'uppercase'}}>{copy.currencyLabel}</div>
      </div>
      <div style={{bottom: 24, color: 'rgba(245,255,250,.55)', fontSize: 16, left: 100, position: 'absolute'}}>LUKAS · HASHPASS</div>
      <div style={{background: GREEN, bottom: 0, height: 7, left: 0, position: 'absolute', width: `${interpolate(frame, [0, LUKAS_WHY_DURATION_IN_FRAMES], [0, 100], {extrapolateRight: 'clamp'})}%`}} />
    </AbsoluteFill>
  );
};
