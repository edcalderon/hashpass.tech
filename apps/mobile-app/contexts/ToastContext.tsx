import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { MaterialIcons } from '../lib/vector-icons';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  hideToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { isDark, colors } = useTheme();

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now().toString();
    // Use default duration of 2369ms (2.369 seconds) if duration is not explicitly provided (undefined or not set)
    const duration = toast.duration !== undefined ? toast.duration : 2369;
    const newToast: Toast = {
      id,
      ...toast, // Spread all toast properties
      duration, // Always set duration (either explicit or default)
    };

    console.log('🔔 Creating toast:', newToast);
    setToasts(prev => {
      const updated = [...prev, newToast];
      console.log('🔔 Updated toasts array:', updated);
      return updated;
    });
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const getToastStyles = (type: Toast['type']) => {
    // Dark mode: use #2C2C2E (clearly distinct from #121212 and #1E1E1E screen backgrounds)
    // Light mode: use pure white (distinct from #F5F5F7 backgrounds)
    const baseBackground = isDark ? '#2C2C2E' : '#FFFFFF';
    const baseStyles = {
      borderLeftWidth: 4,
      backgroundColor: baseBackground,
    };

    switch (type) {
      case 'success':
        return {
          ...baseStyles,
          borderLeftColor: colors.success.main,
          borderColor: isDark ? 'rgba(76, 175, 80, 0.5)' : 'rgba(76, 175, 80, 0.35)',
        };
      case 'error':
        return {
          ...baseStyles,
          borderLeftColor: colors.error.main,
          borderColor: isDark ? 'rgba(255, 82, 82, 0.5)' : 'rgba(255, 82, 82, 0.35)',
        };
      case 'warning':
        return {
          ...baseStyles,
          borderLeftColor: colors.warning.main,
          borderColor: isDark ? 'rgba(255, 171, 0, 0.5)' : 'rgba(255, 171, 0, 0.35)',
        };
      case 'info':
        return {
          ...baseStyles,
          borderLeftColor: colors.primary,
          borderColor: isDark ? 'rgba(161, 209, 214, 0.5)' : 'rgba(175, 13, 1, 0.35)',
        };
      default:
        return {
          ...baseStyles,
          borderLeftColor: colors.divider,
          borderColor: colors.divider,
        };
    }
  };

  const getToastIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return { name: 'check-circle', color: '#4CAF50' };
      case 'error':
        return { name: 'error', color: '#F44336' };
      case 'warning':
        return { name: 'warning', color: '#FF9800' };
      case 'info':
        return { name: 'info', color: '#2196F3' };
      default:
        return { name: 'info', color: colors.text.secondary };
    }
  };

  return (
    <>
      <ToastContext.Provider value={{ showToast, hideToast, clearAllToasts }}>
        {children}
      </ToastContext.Provider>
      
      {/* Toast Container - Using absolute positioning to avoid blocking interactions */}
      {toasts.length > 0 && (
        <View style={styles.toastContainer} pointerEvents="box-none">
          <SafeAreaView edges={['top', 'left', 'right']} style={styles.toastSafeArea} pointerEvents="box-none">
            {toasts.map((toast, index) => (
              <ToastItem
                key={toast.id}
                toast={toast}
                index={index}
                onHide={() => hideToast(toast.id)}
                getToastStyles={getToastStyles}
                getToastIcon={getToastIcon}
                colors={colors}
                isDark={isDark}
              />
            ))}
          </SafeAreaView>
        </View>
      )}
    </>
  );
};

interface ToastItemProps {
  toast: Toast;
  index: number;
  onHide: () => void;
  getToastStyles: (type: Toast['type']) => any;
  getToastIcon: (type: Toast['type']) => { name: string; color: string };
  colors: any;
  isDark: boolean;
}

const ToastItem: React.FC<ToastItemProps> = ({
  toast,
  index,
  onHide,
  getToastStyles,
  getToastIcon,
  colors,
  isDark,
}) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(100)); // Start from bottom (positive value)
  const [progressAnim] = useState(new Animated.Value(0)); // Progress bar animation
  const autoHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDismissDuration = toast.duration ?? 0;
  const remainingDurationRef = useRef(autoDismissDuration);
  const startTimestampRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);
  const isDismissingRef = useRef(false);

  // Determine if toast is non-critical (errors are critical, others are not)
  const isAutoDismissToast = toast.type !== 'error' && autoDismissDuration > 0;

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimeoutRef.current) {
      clearTimeout(autoHideTimeoutRef.current);
      autoHideTimeoutRef.current = null;
    }
  }, []);

  const handleHide = useCallback(() => {
    if (isDismissingRef.current) return;

    isDismissingRef.current = true;
    clearAutoHideTimer();
    progressAnim.stopAnimation();

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 100, // Slide down to bottom
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  }, [clearAutoHideTimer, fadeAnim, onHide, progressAnim, slideAnim]);

  const startAutoHideCountdown = useCallback((durationMs: number) => {
    if (!isAutoDismissToast || durationMs <= 0 || isDismissingRef.current) return;

    clearAutoHideTimer();
    remainingDurationRef.current = durationMs;
    startTimestampRef.current = Date.now();
    isPausedRef.current = false;

    autoHideTimeoutRef.current = setTimeout(() => {
      autoHideTimeoutRef.current = null;
      if (!isDismissingRef.current) {
        handleHide();
      }
    }, durationMs);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: false, // Width animation requires native driver to be false
    }).start(({ finished }) => {
      if (finished && !isPausedRef.current && !isDismissingRef.current) {
        handleHide();
      }
    });
  }, [clearAutoHideTimer, handleHide, isAutoDismissToast, progressAnim]);

  const pauseAutoHideCountdown = useCallback(() => {
    if (!isAutoDismissToast || isPausedRef.current || isDismissingRef.current) return;

    isPausedRef.current = true;
    clearAutoHideTimer();
    progressAnim.stopAnimation((value) => {
      const currentValue = typeof value === 'number' ? value : 0;
      const startedAt = startTimestampRef.current;
      const elapsed = startedAt ? Date.now() - startedAt : 0;
      remainingDurationRef.current = Math.max(0, remainingDurationRef.current - elapsed);
      startTimestampRef.current = null;
      progressAnim.setValue(currentValue);
    });
  }, [clearAutoHideTimer, isAutoDismissToast, progressAnim]);

  const resumeAutoHideCountdown = useCallback(() => {
    if (!isAutoDismissToast || !isPausedRef.current || isDismissingRef.current) return;

    const remaining = remainingDurationRef.current;
    if (remaining <= 0) {
      handleHide();
      return;
    }

    startAutoHideCountdown(remaining);
  }, [handleHide, isAutoDismissToast, startAutoHideCountdown]);

  React.useEffect(() => {
    // Animate in with spring effect
    Animated.parallel([
      Animated.spring(fadeAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Start progress bar animation for non-critical toasts
    if (isAutoDismissToast && autoDismissDuration > 0) {
      startAutoHideCountdown(autoDismissDuration);
    }
    return () => {
      clearAutoHideTimer();
      progressAnim.stopAnimation();
    };
  }, [autoDismissDuration, clearAutoHideTimer, fadeAnim, isAutoDismissToast, progressAnim, slideAnim, startAutoHideCountdown]);

  const icon = getToastIcon(toast.type);
  const toastStyles = getToastStyles(toast.type);

  return (
    <Animated.View
      style={[
        styles.toastItem,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          marginTop: index * 12,
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={[
          styles.toast,
          toastStyles,
          {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.85 : 0.25,
            shadowRadius: 14,
            elevation: 20,
          }
        ]}
        onPressIn={isAutoDismissToast ? pauseAutoHideCountdown : undefined}
        onPressOut={isAutoDismissToast ? resumeAutoHideCountdown : undefined}
      >
        <View style={styles.toastContent}>
          <View style={styles.toastHeader}>
            <View style={[styles.iconContainer, { 
              backgroundColor: isDark 
                ? `${icon.color}30` // More visible icon background in dark theme
                : `${icon.color}18` // Subtle icon background in light theme
            }]}>
              <MaterialIcons
                name={icon.name as any}
                size={22}
                color={icon.color}
              />
            </View>
            <View style={styles.toastTextContainer}>
              <Text style={[styles.toastTitle, {
                color: isDark ? '#FFFFFF' : '#1A1A1A',
                fontWeight: '600',
              }]}>
                {toast.title}
              </Text>
              {toast.message && (
                <Text
                  style={[styles.toastMessage, {
                    color: isDark ? '#AEAEB2' : '#6C6C70',
                  }]}
                  numberOfLines={3}
                  ellipsizeMode="tail"
                >
                  {toast.message}
                </Text>
              )}
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={handleHide}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons
                name="close"
                size={18}
                color={isDark ? '#8E8E93' : '#6C6C70'}
              />
            </Pressable>
          </View>
          
          {toast.action && (
            <Pressable
              style={[
                styles.actionButton, 
                { 
                  borderColor: icon.color,
                  backgroundColor: `${icon.color}15`,
                }
              ]}
              onPress={() => {
                toast.action?.onPress();
                handleHide();
              }}
            >
              <Text style={[styles.actionButtonText, { color: icon.color }]}>
                {toast.action.label}
              </Text>
            </Pressable>
          )}
        </View>
        
        {/* Progress bar for auto-dismiss toasts */}
        {isAutoDismissToast && (
          <View style={[styles.progressBarContainer, { backgroundColor: `${icon.color}18` }]}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  backgroundColor: icon.color,
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
    paddingHorizontal: 20,
    zIndex: 9999,
    elevation: 9999,
    pointerEvents: 'box-none',
  },
  toastSafeArea: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    pointerEvents: 'box-none',
  },
  toastItem: {
    marginBottom: 12,
    width: '95%',
    maxWidth: 400,
  },
  toast: {
    borderRadius: 16,
    padding: 16,
    minHeight: 64,
    borderWidth: 1,
  },
  toastContent: {
    flexShrink: 1,
  },
  toastHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  toastTextContainer: {
    flex: 1,
    marginRight: 8,
    paddingTop: 2,
  },
  toastTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  toastMessage: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  closeButton: {
    padding: 4,
    marginTop: -2,
    borderRadius: 12,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignSelf: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 6,
    left: 16,
    right: 16,
    height: 3,
    overflow: 'hidden',
    borderRadius: 2,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 2,
  },
});

// Convenience functions for common toast types
export const useToastHelpers = () => {
  const { showToast } = useToast();

  const showSuccess = useCallback((title: string, message?: string, actionOrDuration?: Toast['action'] | number, action?: Toast['action']) => {
    // Handle both old signature (action as 3rd param) and new signature (duration as 3rd param, action as 4th)
    let duration: number | undefined;
    let finalAction: Toast['action'] | undefined;
    
    if (typeof actionOrDuration === 'number') {
      // New signature: (title, message, duration, action)
      duration = actionOrDuration;
      finalAction = action;
    } else if (actionOrDuration && typeof actionOrDuration === 'object') {
      // Old signature: (title, message, action)
      finalAction = actionOrDuration;
    }
    
    showToast({ type: 'success', title, message, duration, action: finalAction });
  }, [showToast]);

  const showError = useCallback((title: string, message?: string, actionOrDuration?: Toast['action'] | number, action?: Toast['action']) => {
    let duration: number | undefined;
    let finalAction: Toast['action'] | undefined;
    
    if (typeof actionOrDuration === 'number') {
      duration = actionOrDuration;
      finalAction = action;
    } else if (actionOrDuration && typeof actionOrDuration === 'object') {
      finalAction = actionOrDuration;
    }
    
    showToast({ type: 'error', title, message, duration, action: finalAction });
  }, [showToast]);

  const showWarning = useCallback((title: string, message?: string, actionOrDuration?: Toast['action'] | number, action?: Toast['action']) => {
    let duration: number | undefined;
    let finalAction: Toast['action'] | undefined;
    
    if (typeof actionOrDuration === 'number') {
      duration = actionOrDuration;
      finalAction = action;
    } else if (actionOrDuration && typeof actionOrDuration === 'object') {
      finalAction = actionOrDuration;
    }
    
    showToast({ type: 'warning', title, message, duration, action: finalAction });
  }, [showToast]);

  const showInfo = useCallback((title: string, message?: string, actionOrDuration?: Toast['action'] | number, action?: Toast['action']) => {
    let duration: number | undefined;
    let finalAction: Toast['action'] | undefined;
    
    if (typeof actionOrDuration === 'number') {
      duration = actionOrDuration;
      finalAction = action;
    } else if (actionOrDuration && typeof actionOrDuration === 'object') {
      finalAction = actionOrDuration;
    }
    
    showToast({ type: 'info', title, message, duration, action: finalAction });
  }, [showToast]);

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
};
