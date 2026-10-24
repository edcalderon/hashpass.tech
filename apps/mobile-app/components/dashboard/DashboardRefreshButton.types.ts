export type DashboardRefreshButtonProps = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Keep the action icon-only until hover/focus reveals the translated label. */
  compact?: boolean;
  label: string;
  loadingLabel: string;
  hint?: string;
  testID?: string;
};
