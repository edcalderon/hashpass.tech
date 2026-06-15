import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

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

    // Auto-hide after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        hideToast(id);
      }, newToast.duration);
    }
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const getToastStyles = (type: Toast['type']) => {
    const baseBackground = isDark ? colors.surface : colors.background.paper;
    const baseStyles = {
      borderLeftWidth: 4,
      backgroundColor: baseBackground, // Always use theme background color
    };

    switch (type) {
      case 'success':
        // Use theme success color with border accent, background stays theme color
        return {
          ...baseStyles,
          borderLeftColor: colors.success.main,
          borderColor: isDark ? 'rgba(76, 175, 80, 0.3)' : 'rgba(76, 175, 80, 0.25)',
        };
      case 'error':
        // Use theme error color with border accent, background stays theme color
        return {
          ...baseStyles,
          borderLeftColor: colors.error.main,
          borderColor: isDark ? 'rgba(255, 82, 82, 0.3)' : 'rgba(255, 82, 82, 0.25)',
        };
      case 'warning':
        // Use theme warning color with border accent, background stays theme color
        return {
          ...baseStyles,
          borderLeftColor: colors.warning.main,
          borderColor: isDark ? 'rgba(255, 171, 0, 0.3)' : 'rgba(255, 171, 0, 0.25)',
        };
      case 'info':
        // Use primary color with border accent, background stays theme color
        return {
          ...baseStyles,
          borderLeftColor: colors.primary,
          borderColor: isDark ? 'rgba(161, 209, 214, 0.3)' : 'rgba(175, 13, 1, 0.25)',
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

  // Determine if toast is non-critical (errors are critical, others are not)
  const isNonCritical = toast.type !== 'error' && toast.duration && toast.duration > 0;

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
    if (isNonCritical && toast.duration) {
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: toast.duration,
        useNativeDriver: false, // Width animation requires native driver to be false
      }).start();
    }
  }, []);

  const handleHide = () => {
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
  };

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
      <View 
        style={[
          styles.toast, 
          toastStyles,
          {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.5 : 0.2,
            shadowRadius: 8,
            elevation: 8,
          }
        ]}
        pointerEvents="auto"
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
                color: colors.text.primary,
                fontWeight: '600',
              }]}>
                {toast.title}
              </Text>
              {toast.message && (
                <Text style={[styles.toastMessage, { 
                  color: colors.text.secondary,
                }]}>
                  {toast.message}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleHide}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons
                name="close"
                size={18}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
          </View>
          
          {toast.action && (
            <TouchableOpacity
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
            </TouchableOpacity>
          )}
        </View>
        
        {/* Progress bar for non-critical toasts */}
        {isNonCritical && (
          <View style={styles.progressBarContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  backgroundColor: icon.color,
                  opacity: 0.85, // Slightly transparent for a more polished look
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        )}
      </View>
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
    flex: 1,
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
    bottom: 0,
    left: 0, // Start from left edge to overlap with left border color
    right: 14, // Padding on right to prevent reaching card border
    height: 2, // Thinner, more polished bar
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderBottomLeftRadius: 12, // Adjusted radius to match increased padding
    borderBottomRightRadius: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2196F3',
    alignSelf: 'flex-start', // Align to left so it fills from left to right
    borderRadius: 1, // Slight rounding on the bar itself
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
