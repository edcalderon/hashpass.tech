export interface ContactProfile {
  id: string;
  name: string;
  role: string;
  company: string;
  topics: string[];
  discoverable: boolean;
  leaderboard: boolean;
  share_id?: string;
  identity_mode?: ContactIdentityMode;
  avatar_url?: string;
  points: number;
  connections: number;
}

export type ContactIdentityMode = 'attendee' | 'speaker';

export interface ContactRequest {
  id: string;
  profile: ContactProfile;
}

export interface ContactsSnapshot {
  profile: ContactProfile | null;
  contacts: ContactProfile[];
  incoming: ContactRequest[];
  outgoing: string[];
  suggestions: ContactProfile[];
  leaderboard: ContactProfile[];
  shared: ContactProfile | null;
}

export type ContactsApiResult = { success: true; data: ContactsSnapshot } | { success: false; error: string };

export interface ContactProfileDraft {
  name: string;
  role: string;
  company: string;
  topics: string[];
  discoverable: boolean;
  leaderboard: boolean;
  identity_mode: ContactIdentityMode;
}

export type ContactsAction =
  | { action: 'profile'; profile: ContactProfileDraft }
  | { action: 'request'; card: string }
  | { action: 'accept' | 'decline' | 'cancel'; requestId: string };

export type ContactsTab = 'network' | 'directory' | 'incoming' | 'leaderboard';
export type ContactGrouping = 'topic' | 'company';

export interface ContactsExperienceProps {
  snapshot: ContactsSnapshot | null;
  loading?: boolean;
  busy?: boolean;
  error?: string | null;
  signedIn: boolean;
  standalone?: boolean;
  mode: 'light' | 'dark';
  onAction: (action: ContactsAction) => Promise<boolean>;
  onRetry: () => void;
  onSignIn: () => void;
  onDashboard: () => void;
  onStandalone: () => void;
}

export interface ContactsGraphProps {
  contacts: ContactProfile[];
  topics: string[];
  grouping: ContactGrouping;
  selected: string | null;
  mode: 'light' | 'dark';
  onSelect: (id: string) => void;
  youLabel: string;
  topicLabel: (topic: string) => string;
}
