export type ProfileSettingsSection = 'profile' | 'settings';

export interface EmbeddedDashboardPageProps {
  embedded?: boolean;
  onBack?: () => void;
  onOpenSettings?: () => void;
}
