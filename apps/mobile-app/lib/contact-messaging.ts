import type { ContactConversation, MessagingAction } from '../types/contact-messaging';
export const CONTACT_HANDLE = /^[a-z0-9_]{3,30}$/;
export const normalizeContactHandle = (value: string) => value.trim().replace(/^@/, '').toLowerCase();
export const pendingConversations = (conversations: ContactConversation[]) => conversations.filter(item => item.needs_reply);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validMessagingAction(value: unknown): value is MessagingAction {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  if (typeof body.peer !== 'string' || !uuid.test(body.peer)) return false;
  if (body.action === 'thread') return body.before === undefined || typeof body.before === 'string' && /^[1-9][0-9]{0,17}$/.test(body.before);
  return body.action === 'send' && typeof body.id === 'string' && uuid.test(body.id) &&
    typeof body.body === 'string' && body.body.trim().length > 0 && body.body.length <= 4000;
}
/** apiClient wraps the JSON response body in its own data property. */
export function messagingData<T>(value: unknown): T {
  const response = value as { success: boolean; data?: { data?: T }; error?: string };
  if (!response.success || !response.data?.data) throw new Error('Messages are temporarily unavailable. Please try again.');
  return response.data.data;
}
