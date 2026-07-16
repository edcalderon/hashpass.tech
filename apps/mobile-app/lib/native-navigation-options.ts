export const resolveRootStackMotionOptions = (platformOS: string) => (
  platformOS === 'android'
    ? {
        // Android Fabric builds have crashed when react-native-screens emits
        // topTransitionProgress during auth redirects between root stack routes.
        animation: 'none' as const,
        animationTypeForReplace: 'push' as const,
      }
    : {
        animation: 'slide_from_right' as const,
        animationTypeForReplace: 'push' as const,
      }
);

export const resolveDashboardStackOptions = (platformOS: string) => ({
  headerShown: false,
  gestureEnabled: false,
  ...(platformOS === 'android'
    ? {
        // Android Fabric builds have crashed on native-stack transition events
        // such as topTransitionProgress during auth -> dashboard entry.
        animation: 'none' as const,
        animationTypeForReplace: 'push' as const,
      }
    : {}),
});
