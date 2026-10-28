import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

// The static export is rendered without a viewport, so it always uses the mobile layout. React keeps
// the server's class names when the browser's first render differs, so the first client render must
// match the server and the real breakpoint is applied after mount.
export const useIsMobile = (breakpoint = 768): boolean => {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? width < breakpoint : true;
};

export default useIsMobile;
