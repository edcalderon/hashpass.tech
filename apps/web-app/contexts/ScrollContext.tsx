import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { Animated } from 'react-native';

export interface ScrollContextType {
  scrollY: Animated.Value;
  headerOpacity: Animated.AnimatedInterpolation<number>;
  headerBackground: Animated.AnimatedInterpolation<string>;
  headerTint: Animated.AnimatedInterpolation<string>;
  headerBlur: Animated.AnimatedInterpolation<number>;
  headerBorderWidth: Animated.AnimatedInterpolation<number>;
  headerShadowOpacity: Animated.AnimatedInterpolation<number>;
  headerHeight: number;
  setHeaderHeight: (height: number) => void;
  setScrollY: (value: number) => void;
}

const ScrollContext = createContext<ScrollContextType | undefined>(undefined);

const HEADER_SCROLL_DISTANCE = 100;

export const ScrollProvider = ({ children }: { children: ReactNode }) => {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(0);

  // Function to update the scroll position from child components
  const setScrollY = (value: number) => {
    scrollY.setValue(value);
  };

  // Interpolate header opacity based on scroll position
  // Start with full opacity when not scrolled for better visibility
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE * 0.3, HEADER_SCROLL_DISTANCE],
    outputRange: [0.95, 1, 1], // Start slightly transparent, then fully opaque
    extrapolate: 'clamp',
  });

  // Interpolate header background color - transparent when scrolled to show content behind
  const headerBackground = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE * 0.3, HEADER_SCROLL_DISTANCE * 0.7, HEADER_SCROLL_DISTANCE],
    outputRange: [
      'rgba(255, 255, 255, 0.7)',   // Start with semi-transparent white
      'rgba(255, 255, 255, 0.4)',   // More transparent as you scroll
      'rgba(255, 255, 255, 0.2)',   // Very transparent
      'rgba(255, 255, 255, 0.15)'   // Almost transparent to show banner/content behind
    ],
    extrapolate: 'clamp',
  });
  
  // Remove blue tint - let content color show through
  const headerTint = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [
      'rgba(0, 0, 0, 0)',  // No tint - let content show through
      'rgba(0, 0, 0, 0)'   // No tint when scrolled
    ],
    extrapolate: 'clamp',
  });

  // Interpolate blur radius - stronger blur when scrolled to create glass effect
  const headerBlur = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE * 0.3, HEADER_SCROLL_DISTANCE],
    outputRange: [10, 20, 30], // Increase blur to create frosted glass effect
    extrapolate: 'clamp',
  });

  // Interpolate header border width and shadow
  const headerBorderWidth = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE * 0.5, HEADER_SCROLL_DISTANCE],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  // Add shadow opacity for better depth
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE * 0.3, HEADER_SCROLL_DISTANCE],
    outputRange: [0.1, 0.2, 0.3],
    extrapolate: 'clamp',
  });

  return (
    <ScrollContext.Provider
      value={{
        scrollY,
        headerOpacity,
        headerBackground,
        headerTint,
        headerBlur,
        headerBorderWidth,
        headerShadowOpacity,
        headerHeight,
        setHeaderHeight,
        setScrollY,
      }}>
      {children}
    </ScrollContext.Provider>
  );
};

export interface ScrollContextType {
  scrollY: Animated.Value;
  headerOpacity: Animated.AnimatedInterpolation<number>;
  headerBackground: Animated.AnimatedInterpolation<string>;
  headerTint: Animated.AnimatedInterpolation<string>;
  headerBlur: Animated.AnimatedInterpolation<number>;
  headerBorderWidth: Animated.AnimatedInterpolation<number>;
  headerShadowOpacity: Animated.AnimatedInterpolation<number>;
  headerHeight: number;
  setHeaderHeight: (height: number) => void;
  setScrollY: (value: number) => void;
}

export const useScroll = (): ScrollContextType => {
  const context = useContext(ScrollContext);
  if (context === undefined) {
    throw new Error('useScroll must be used within a ScrollProvider');
  }
  return context;
};
