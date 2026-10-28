import { useWindowDimensions } from 'react-native';

export const useIsMobile = (breakpoint = 768): boolean => {
  const { width } = useWindowDimensions();
  return width < breakpoint;
};

export default useIsMobile;
