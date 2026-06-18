import { useState, useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';

export const useIsMobile = (breakpoint = 768): boolean => {
  // On native, always treat as mobile (no window resize events).
  const [isMobile, setIsMobile] = useState<boolean>(
    Platform.OS !== 'web' ? true : Dimensions.get('window').width < breakpoint,
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setIsMobile(true);
      return;
    }

    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, [breakpoint]);

  return isMobile;
};

export default useIsMobile;
