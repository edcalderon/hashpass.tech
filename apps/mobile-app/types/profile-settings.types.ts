export type ProfileSettingsSection = 'profile' | 'settings';
export type SettingsShortcut = 'authenticator' | 'delete-account' | 'about';

export interface EmbeddedDashboardPageProps {
  embedded?: boolean;
  onBack?: () => void;
  onOpenSettings?: (shortcut?: SettingsShortcut) => void;
  initialSettingsShortcut?: SettingsShortcut;
}
