import React, { useEffect, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import type { LukasCapInstance, LukasCapWindow, LukasCaptchaProps } from '../types/lukas.types';

const API_ENDPOINT = 'https://api.hashpass.tech/api/captcha/';
const SOLVE_FAILURE_MESSAGE = 'The security check could not be completed. Please try again.';
const WIDGET_URL = 'https://unpkg.com/@cap.js/widget@0.1.56';

let widgetLoadPromise: Promise<void> | null = null;

const loadWidget = (): Promise<void> => {
  if (typeof window === 'undefined' || !('customElements' in window)) return Promise.reject(new Error('Captcha is only available in a browser.'));
  if (customElements.get('cap-widget')) return Promise.resolve();
  if (widgetLoadPromise) return widgetLoadPromise;

  const existing = document.querySelector('script[data-lukas-cap-widget]');
  let script: HTMLScriptElement | undefined;
  const loadPromise = new Promise<void>((resolve, reject) => {
    if (existing) {
      const onError = () => reject(new Error('Could not load security check.'));
      existing.addEventListener('error', onError, { once: true });
      customElements.whenDefined('cap-widget').then(
        () => {
          existing.removeEventListener('error', onError);
          resolve();
        },
        (error) => {
          existing.removeEventListener('error', onError);
          reject(error);
        },
      );
      return;
    }

    const scriptElement = document.createElement('script');
    script = scriptElement;
    scriptElement.type = 'module';
    scriptElement.src = WIDGET_URL;
    scriptElement.dataset.lukasCapWidget = '';
    scriptElement.onload = () => customElements.whenDefined('cap-widget').then(() => resolve()).catch(reject);
    scriptElement.onerror = () => reject(new Error('Could not load security check.'));
    document.head.appendChild(scriptElement);
  });

  widgetLoadPromise = loadPromise.then(
    () => {
      widgetLoadPromise = null;
    },
    (error) => {
      script?.remove();
      existing?.remove();
      widgetLoadPromise = null;
      throw error;
    },
  );
  return widgetLoadPromise;
};

export async function solveLukasCaptcha(): Promise<string> {
  if (Platform.OS !== 'web') throw new Error(SOLVE_FAILURE_MESSAGE);

  let cap: LukasCapInstance | null = null;
  try {
    await loadWidget();
    const Cap = (window as LukasCapWindow).Cap;
    if (!Cap) throw new Error('Cap.js programmatic API is unavailable.');
    cap = new Cap({ apiEndpoint: API_ENDPOINT });
    const proof = await cap.solve();
    if (!proof.success || !proof.token) throw new Error('Cap.js did not return a proof token.');
    return proof.token;
  } catch {
    throw new Error(SOLVE_FAILURE_MESSAGE);
  } finally {
    cap?.widget.remove();
  }
}

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
