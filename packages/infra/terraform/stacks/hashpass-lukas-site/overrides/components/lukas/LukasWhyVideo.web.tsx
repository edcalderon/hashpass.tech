import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { LukasWhyVideoProps } from '../../types/lukas.types';
import { LukasCoin } from './LukasCoin';

const SUPPORTED_LOCALES = new Set(['en', 'es', 'ko', 'fr', 'pt', 'de']);

const normalizeLocale = (locale: string): string => {
  const base = locale.toLowerCase().split('-')[0];
  return SUPPORTED_LOCALES.has(base) ? base : 'en';
};

const fallbackCopy: Record<string, { label: string; detail: string; play: string; loading: string; expand: string; collapse: string }> = {
  en: { label: 'How LUKAS stays stable', detail: 'One regional index, five local currencies.', play: 'Play video', loading: 'Loading explainer…', expand: 'Expand video', collapse: 'Exit full screen' },
  es: { label: 'Cómo LUKAS mantiene su estabilidad', detail: 'Un índice regional, cinco monedas locales.', play: 'Reproducir video', loading: 'Cargando explicación…', expand: 'Ampliar video', collapse: 'Salir de pantalla completa' },
  ko: { label: 'LUKAS가 안정적인 이유', detail: '하나의 지역 지수, 다섯 개의 현지 통화.', play: '비디오 재생', loading: '설명 영상 로드 중…', expand: '영상 확대', collapse: '전체 화면 닫기' },
  fr: { label: 'Comment LUKAS reste stable', detail: 'Un indice régional, cinq monnaies locales.', play: 'Lire la vidéo', loading: 'Chargement de l’explication…', expand: 'Agrandir la vidéo', collapse: 'Quitter le plein écran' },
  pt: { label: 'Como LUKAS se mantém estável', detail: 'Um índice regional, cinco moedas locais.', play: 'Reproduzir vídeo', loading: 'Carregando explicação…', expand: 'Expandir vídeo', collapse: 'Sair da tela cheia' },
  de: { label: 'Wie LUKAS stabil bleibt', detail: 'Ein regionaler Index, fünf lokale Währungen.', play: 'Video abspielen', loading: 'Erklärung wird geladen…', expand: 'Video vergrößern', collapse: 'Vollbild verlassen' },
};

export function LukasWhyVideo({ locale, animationLevel, isDark, onReward }: LukasWhyVideoProps) {
  const videoLocale = normalizeLocale(locale);
  const copy = fallbackCopy[videoLocale];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [playButtonActive, setPlayButtonActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const source = useMemo(() => `/lukas/videos/why-${videoLocale}.mp4`, [videoLocale]);
  const captions = useMemo(() => `/lukas/captions/why-${videoLocale}.vtt`, [videoLocale]);

  useEffect(() => {
    setHasFailed(false);
    setStarted(false);
    setReady(false);
  }, [source]);

  useEffect(() => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame) return undefined;

    let visible = true;
    const syncPlayback = () => {
      const shouldPlay = started && visible && !document.hidden && animationLevel === 'full';
      if (shouldPlay) void video.play().catch(() => undefined);
      else video.pause();
    };
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        syncPlayback();
      }, { threshold: 0.15 });
    observer?.observe(frame);
    const onVisibilityChange = () => syncPlayback();
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!started || animationLevel !== 'full') video.currentTime = 0;
    syncPlayback();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      video.pause();
    };
  }, [animationLevel, source, started]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const startPlayback = () => {
    const video = videoRef.current;
    setStarted(true);
    if (video?.readyState && video.readyState >= 3) void video.play().catch(() => undefined);
  };

  const toggleFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) await document.exitFullscreen?.();
    else await frame.requestFullscreen?.();
  };

  if (hasFailed) {
    return (
      <View style={[styles.fallback, { backgroundColor: isDark ? '#0A2733' : '#F0F8F2' }]} accessibilityLabel={copy.label}>
        <Image source={{ uri: '/coins/lukas-coin.svg' }} style={styles.fallbackCoin} accessibilityIgnoresInvertColors />
        <Text style={[styles.fallbackLabel, { color: isDark ? '#7EE6A0' : '#087A4A' }]}>{copy.label}</Text>
        <Text style={[styles.fallbackDetail, { color: isDark ? '#BED2C6' : '#425D4D' }]}>{copy.detail}</Text>
      </View>
    );
  }

  return (
    <div ref={frameRef} style={{ ...styles.frame, ...(isFullscreen ? styles.fullscreenFrame : {}) } as React.CSSProperties}>
      <video
        ref={videoRef}
        src={source}
        playsInline
        preload="metadata"
        poster="/lukas-social-card.png"
        controls={started && ready}
        aria-label={copy.label}
        style={{ ...styles.video, opacity: ready && started ? 1 : 0 } as React.CSSProperties}
        onCanPlay={() => {
          setReady(true);
          if (started && animationLevel === 'full') void videoRef.current?.play().catch(() => undefined);
        }}
        onPlay={() => {
          setStarted(true);
          onReward?.();
        }}
        onEnded={() => {
          if (videoRef.current) videoRef.current.currentTime = 0;
          setPlayButtonActive(false);
          setStarted(false);
        }}
        onError={() => setHasFailed(true)}
      >
        <track kind="captions" src={captions} srcLang={videoLocale} label={videoLocale.toUpperCase()} default />
      </video>
      {(!started || !ready) ? (
        <div style={styles.poster as React.CSSProperties}>
          <div style={styles.posterVisual as React.CSSProperties}>
            <LukasCoin size={142} animationLevel="none" />
            <span style={styles.posterWordmark as React.CSSProperties}>LUKAS</span>
          </div>
          {started ? (
            <span style={styles.loading as React.CSSProperties}>{copy.loading}</span>
          ) : (
            <button
              type="button"
              onClick={startPlayback}
              onMouseEnter={() => setPlayButtonActive(true)}
              onMouseLeave={() => setPlayButtonActive(false)}
              onFocus={() => setPlayButtonActive(true)}
              onBlur={() => setPlayButtonActive(false)}
              aria-label={copy.play}
              title={copy.play}
              style={{
                ...styles.playButton,
                ...(playButtonActive ? styles.playButtonActive : {}),
              } as React.CSSProperties}
            >
              <span aria-hidden="true" style={styles.playIcon as React.CSSProperties}>▶</span>
              <span
                style={{
                  ...styles.playLabel,
                  ...(playButtonActive ? styles.playLabelActive : {}),
                  opacity: playButtonActive ? 1 : 0,
                } as React.CSSProperties}
              >
                {copy.play}
              </span>
            </button>
          )}
        </div>
      ) : null}
      {started && ready ? (
        <button type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? copy.collapse : copy.expand} style={styles.expandButton as React.CSSProperties}>
          <span aria-hidden="true" style={styles.expandIcon as React.CSSProperties}>{isFullscreen ? '×' : '⛶'}</span>
        </button>
      ) : null}
    </div>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 16 / 9,
    backgroundColor: '#06111E',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  video: {
    display: 'block',
    height: '100%',
    objectFit: 'cover',
    transition: 'opacity 180ms ease',
    width: '100%',
  },
  fullscreenFrame: {
    backgroundColor: '#06111E',
    borderRadius: 0,
    height: '100vh',
    maxWidth: 'none',
    width: '100vw',
  },
  poster: {
    alignItems: 'center',
    background: 'linear-gradient(145deg, rgba(247,252,249,.98), rgba(232,247,237,.98))',
    display: 'flex',
    flexDirection: 'column',
    inset: 0,
    justifyContent: 'center',
    padding: 14,
    position: 'absolute',
  },
  posterVisual: { alignItems: 'center', display: 'flex', flex: 1, justifyContent: 'center', minHeight: 0, position: 'relative', width: '100%' },
  posterWordmark: { bottom: 2, color: '#087A4A', fontSize: 20, fontWeight: '800', letterSpacing: 3, position: 'absolute' },
  playButton: { alignItems: 'center', backgroundColor: '#36C66B', border: '0', borderRadius: 999, boxShadow: '0 8px 20px rgba(8,122,74,.25)', color: '#062414', cursor: 'pointer', display: 'flex', fontSize: 14, fontWeight: '800', gap: 0, height: 56, justifyContent: 'center', padding: 0, position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', transition: 'width 160ms ease, box-shadow 160ms ease, background-color 160ms ease', width: 56, zIndex: 3 },
  playButtonActive: { backgroundColor: '#49D77B', boxShadow: '0 10px 26px rgba(8,122,74,.36)', gap: 8, padding: '0 18px', width: 148 },
  playIcon: { fontSize: 17, marginLeft: 2 },
  playLabel: { maxWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'max-width 160ms ease, opacity 120ms ease' },
  playLabelActive: { maxWidth: 110 },
  loading: { backgroundColor: 'rgba(6,17,30,.78)', borderRadius: 999, color: '#F5FFFA', fontSize: 13, fontWeight: '700', padding: '10px 15px' },
  expandButton: { alignItems: 'center', backgroundColor: 'rgba(6,17,30,.78)', border: '1px solid rgba(255,255,255,.4)', borderRadius: 999, color: '#FFFFFF', cursor: 'pointer', display: 'flex', height: 38, justifyContent: 'center', position: 'absolute', right: 12, top: 12, width: 38, zIndex: 4 },
  expandIcon: { fontSize: 22, lineHeight: 1 },
  fallback: {
    alignItems: 'center',
    aspectRatio: 16 / 9,
    borderRadius: 20,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 18,
    width: '100%',
  },
  fallbackCoin: { height: 112, marginBottom: 6, width: 112 },
  fallbackLabel: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  fallbackDetail: { fontSize: 14, marginTop: 8, textAlign: 'center' },
});
