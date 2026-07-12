import React from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
  info: string | null;
};

/**
 * Top-level error boundary. Intentionally self-contained: it does NOT depend on
 * the theme, i18n, or any app provider, because those are exactly the things
 * that may have thrown during startup. When a render error escapes, we show the
 * message and stack on screen instead of letting the native host close the app
 * with a blank screen — this turns an invisible "installs but won't open"
 * failure into something a tester can read and report back.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Keep this visible in logcat / Metro for native crash triage.
    console.error('💥 Uncaught render error:', error?.message, info?.componentStack);
    // This boundary stops the error here (renders the fallback UI below
    // instead of re-throwing), so it never reaches Sentry.wrap()'s own outer
    // boundary in app/_layout.tsx — report it explicitly or Sentry never sees
    // any render error caught here.
    Sentry.captureException(error, { contexts: { react: { componentStack: info?.componentStack } } });
    this.setState({ info: info?.componentStack ?? null });
  }

  render() {
    const { error, info } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#05070C',
          paddingTop: 64,
          paddingHorizontal: 20,
        }}
      >
        <Text style={{ color: '#FF6B6B', fontSize: 20, fontWeight: '700', marginBottom: 12 }}>
          HASHPASS hit a startup error
        </Text>
        <Text style={{ color: '#FFFFFF', fontSize: 14, marginBottom: 16 }}>
          {error.name}: {error.message}
        </Text>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 48 }}
        >
          {!!error.stack && (
            <Text style={{ color: '#9AA4B2', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
              {error.stack}
            </Text>
          )}
          {!!info && (
            <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 16, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
              {info}
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }
}

/**
 * Installs a global JS error handler so errors thrown outside React render
 * (async tasks, event handlers, deferred module init) are surfaced rather than
 * silently swallowed. Safe to call multiple times; only installs once.
 */
let globalHandlerInstalled = false;
export function installGlobalErrorHandler() {
  if (globalHandlerInstalled) return;
  globalHandlerInstalled = true;

  const errorUtils = (global as any)?.ErrorUtils;
  if (!errorUtils?.getGlobalHandler || !errorUtils?.setGlobalHandler) {
    return;
  }

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.error('💥 Global JS error', { isFatal, message: error?.message, stack: error?.stack });
    if (typeof previousHandler === 'function') {
      previousHandler(error, isFatal);
    }
  });
}
