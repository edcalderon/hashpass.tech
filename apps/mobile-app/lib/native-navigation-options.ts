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
