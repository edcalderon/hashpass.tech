import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useColorScheme } from 'nativewind';
import { getInstallationStatus } from '../lib/pwa-utils';

const PWAPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    // Check installation status
    const checkStatus = () => {
      const status = getInstallationStatus();
      setIsInstalled(status.installed);
      setIsStandaloneMode(status.isStandaloneMode);
      
      // Show prompt if:
      // 1. Not installed and install prompt is available, OR
      // 2. Installed but not in standalone mode (viewing in browser) - show "Open App"
      if (!status.installed && status.canInstall) {
        setShowPrompt(true);
      } else if (status.installed && !status.isStandaloneMode) {
        // App is installed but user is viewing in browser - show "Open App"
        setShowPrompt(true);
      } else if (status.installed) {
        // App is installed - don't show install button
        setShowPrompt(false);
      }
    };

    checkStatus();

    // Listen for install prompt
    const handleBeforeInstallPrompt = (event: any) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setShowPrompt(true); // Show prompt when install is available
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      
      // Also check periodically in case status changes
      const interval = setInterval(checkStatus, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        clearInterval(interval);
    };
    }
  }, []);

  const installPWA = () => {
    if (deferredPrompt) {
      // Use browser's install prompt if available
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
          console.log('✅ User accepted the install prompt');
          // Set installation flag in localStorage
          try {
            localStorage.setItem('pwa-installed', 'true');
          } catch {
            // localStorage might not be available
          }
      }
      setDeferredPrompt(null);
    });
    } else {
      // Fallback: Show manual installation instructions
      // For iOS Safari
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);

        if (isIOS) {
          alert('To install: Tap the Share button, then "Add to Home Screen"');
        } else if (isAndroid) {
          alert('To install: Tap the menu (⋮) and select "Install app" or "Add to Home screen"');
        } else {
          alert('To install: Look for the install icon in your browser\'s address bar');
        }
      }
    }
  };

  const openApp = () => {
    // If app is installed, try to open it in standalone mode
    // This will reload the page, which should open in standalone mode if installed
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Try to open the app URL - this should open in standalone mode if installed
      window.location.href = window.location.origin + window.location.pathname;
    }
  };

  // If installed AND in standalone mode, don't show button (already in app)
  if (isInstalled && isStandaloneMode) {
    return null;
  }

  // Show "Open App" if installed but viewing in browser
  if (isInstalled && !isStandaloneMode) {
    return (
      <View style={styles.container}>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: colorScheme === 'dark' ? '#10B981' : '#059669' }]} 
          onPress={openApp}
        >
          <Text style={[styles.text, { color: colorScheme === 'dark' ? '#000000' : '#FFFFFF' }]}>Open App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Don't show if no install option available
  if (!showPrompt && !deferredPrompt) {
    return null;
  }

  const buttonText = 'Install HashPass';

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.button, { backgroundColor: colorScheme === 'dark' ? '#1D9BF0' : '#007AFF' }]} 
        onPress={installPWA}
      >
        <Text style={[styles.text, { color: colorScheme === 'dark' ? '#000000' : '#FFFFFF' }]}>{buttonText}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    zIndex: 1000,
  },
  button: {
    padding: 12,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PWAPrompt;
