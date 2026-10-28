import React, { useEffect, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import type { LukasCaptchaProps } from '../types/lukas.types';

const API_ENDPOINT = 'https://api.hashpass.tech/api/captcha/';
const WIDGET_URL = 'https://unpkg.com/@cap.js/widget@0.1.56';

const loadWidget = (): Promise<void> => {
  if (typeof window === 'undefined' || !('customElements' in window)) return Promise.reject(new Error('Captcha is only available in a browser.'));
  if (customElements.get('cap-widget')) return Promise.resolve();
  const existing = document.querySelector('script[data-lukas-cap-widget]');
  if (existing) return customElements.whenDefined('cap-widget').then(() => undefined);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = WIDGET_URL;
    script.dataset.lukasCapWidget = '';
    script.onload = () => customElements.whenDefined('cap-widget').then(() => resolve()).catch(reject);
    script.onerror = () => reject(new Error('Could not load security check.'));
    document.head.appendChild(script);
  });
};

export function LukasCaptcha({ onSolve, onReset, resetKey = 0 }: LukasCaptchaProps) {
  const hostRef = useRef<any>(null);
  const widgetRef = useRef<any>(null);
  const onSolveRef = useRef(onSolve);
  const onResetRef = useRef(onReset);
  onSolveRef.current = onSolve;
  onResetRef.current = onReset;

  useEffect(() => {
    if (Platform.OS !== 'web' || !hostRef.current) return undefined;
    let cancelled = false;
    let widget: any;
    let onSolveEvent: ((event: Event) => void) | undefined;
    let onResetEvent: (() => void) | undefined;

    loadWidget().then(() => {
      if (cancelled || !hostRef.current) return;
      widget = document.createElement('cap-widget');
      widget.setAttribute('data-cap-api-endpoint', API_ENDPOINT);
      widget.setAttribute('data-cap-disable-haptics', '');
      onSolveEvent = (event: Event) => {
        const token = (event as CustomEvent<{ token?: string }>).detail?.token;
        if (token) onSolveRef.current(token);
      };
      onResetEvent = () => onResetRef.current?.();
      widget.addEventListener('solve', onSolveEvent);
      widget.addEventListener('reset', onResetEvent);
      widgetRef.current = widget;
      hostRef.current.appendChild(widget);
    }).catch(() => onResetRef.current?.());

    return () => {
      cancelled = true;
      if (widget && onSolveEvent) widget.removeEventListener('solve', onSolveEvent);
      if (widget && onResetEvent) widget.removeEventListener('reset', onResetEvent);
      widget?.remove();
      widgetRef.current = null;
    };
  }, [resetKey]);

  if (Platform.OS !== 'web') return <Text>Complete this security check in a browser to continue.</Text>;
  return <View ref={hostRef} accessibilityLabel="Security check" />;
}
