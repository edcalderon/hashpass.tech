export type ProfileSettingsSection = 'profile' | 'settings';
export type PublicProfileTab = 'attendee' | 'speaker';
export type SettingsShortcut = 'authenticator' | 'delete-account' | 'about';

export interface EmbeddedDashboardPageProps {
  embedded?: boolean;
  onBack?: () => void;
  onOpenSettings?: (shortcut?: SettingsShortcut) => void;
  initialSettingsShortcut?: SettingsShortcut;
}
