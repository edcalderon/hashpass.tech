import type { ColorMode } from '@hashpass/ui/tokens';
import type { ContactProfile } from './contacts';
export interface ContactConversation extends Pick<ContactProfile, 'id' | 'name' | 'role' | 'company' | 'avatar_url'> {
  handle: string | null;
  preview: string | null;
  updated_at: string | null;
  needs_reply: boolean;
}
export interface ContactMessage {
  id: string;
  sequence: string;
  sender: string;
  recipient: string;
  body: string;
  created_at: string;
}
export interface MessagingSnapshot { self: string; conversations: ContactConversation[] }
export type MessagingAction = { action: 'thread'; peer: string; before?: string } |
  { action: 'send'; peer: string; id: string; body: string };
export interface MessagingContextValue {
  snapshot: MessagingSnapshot | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  refreshVersion: number;
  changed: () => void;
  account: string | null;
}
export interface MessageAvatarProps { name: string; avatar_url?: string; mode: ColorMode }
export interface FloatingMessagesProps { conversations: ContactConversation[]; label?: string; mode: ColorMode; onPress: () => void }
export interface ContactMessagesProps { mode: ColorMode; peer?: string; handle?: string | null; onContactAction: (action: import('./contacts').ContactsAction) => Promise<boolean>; onRefreshContacts: () => void }
