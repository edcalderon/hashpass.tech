/**
 * Client-side wrapper around app/api/v1/support/frappe/** -- the real Frappe
 * Helpdesk-backed "Contact Support" flow (see app/(shared)/support.tsx).
 * Never talks to Frappe directly: this Frappe instance is staff/agent-only
 * with no public portal, and its service-user credentials live only on the
 * server (see lib/server/frappe-helpdesk.ts).
 */
import { Platform } from 'react-native';
import { apiClient, getRuntimeApiBaseUrl } from '../api-client';

export interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  raisedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  content: string;
  commentedBy: string | null;
  createdAt: string;
  // See FrappeHelpdeskComment.isVisitorReply in lib/server/frappe-helpdesk.ts
  // -- the authoritative signal for "was this the visitor's own message",
  // since `commentedBy` is always the shared service account, never the
  // visitor's email, for anything sent through this API.
  isVisitorReply: boolean;
}

const BASE_PATH = '/v1/support/frappe/tickets';

function readErrorMessage(response: { error?: string; data?: any }, fallback: string): string {
  return response.data?.message || response.error || fallback;
}

export async function createSupportTicket(input: {
  email: string;
  subject: string;
  message: string;
  context?: string;
  // Only meaningful on web -- see SupportCaptcha.web.tsx and
  // app/api/v1/support/frappe/tickets+api.ts's captcha gate. Native omits
  // this and relies on `source: 'native'` instead, same convention as
  // app/api/subscribe+api.ts.
  captchaToken?: string | null;
}): Promise<SupportTicket> {
  const response = await apiClient.post(
    BASE_PATH,
    {
      email: input.email,
      subject: input.subject,
      message: input.message,
      context: input.context,
      captchaToken: input.captchaToken || undefined,
      source: Platform.OS === 'web' ? 'web' : 'native',
    },
    { skipEventSegment: true },
  );
  if (!response.success || !response.data?.ticket) {
    throw new Error(readErrorMessage(response, 'Unable to create ticket'));
  }
  return response.data.ticket;
}

export async function getSupportTicket(
  ticketId: string,
  email: string,
): Promise<{ ticket: SupportTicket; messages: SupportMessage[] }> {
  const response = await apiClient.get(
    `${BASE_PATH}/${encodeURIComponent(ticketId)}`,
    { skipEventSegment: true, params: { email } },
  );
  if (!response.success || !response.data?.ticket) {
    throw new Error(readErrorMessage(response, 'Unable to load ticket'));
  }
  return response.data;
}

export async function sendSupportMessage(input: {
  ticketId: string;
  email: string;
  content: string;
}): Promise<SupportMessage> {
  const response = await apiClient.post(
    `${BASE_PATH}/${encodeURIComponent(input.ticketId)}`,
    { email: input.email, content: input.content },
    { skipEventSegment: true },
  );
  if (!response.success || !response.data?.message) {
    throw new Error(readErrorMessage(response, 'Unable to send message'));
  }
  return response.data.message;
}

export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10MB, matches lib/server/frappe-helpdesk.ts
export const SUPPORT_ATTACHMENT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

// Sends an image/PDF attachment on an existing ticket. `file` is a real
// File (RN's cross-platform image-picker-to-File pattern -- see
// components/CloudinaryImageUpload.tsx -- also works for a document picker
// result, and on web is literally the <input type="file"> value), appended
// to a multipart body so apiClient.request's FormData branch skips JSON
// serialization and lets fetch set its own multipart boundary.
export async function sendSupportAttachment(input: {
  ticketId: string;
  email: string;
  file: File;
}): Promise<SupportMessage> {
  const form = new FormData();
  form.append('email', input.email);
  form.append('file', input.file, input.file.name);

  const response = await apiClient.post(
    `${BASE_PATH}/${encodeURIComponent(input.ticketId)}`,
    form,
    { skipEventSegment: true },
  );
  if (!response.success || !response.data?.message) {
    throw new Error(readErrorMessage(response, 'Unable to send attachment'));
  }
  return response.data.message;
}

export async function closeSupportTicket(ticketId: string, email: string): Promise<SupportTicket> {
  const response = await apiClient.patch(
    `${BASE_PATH}/${encodeURIComponent(ticketId)}`,
    { email },
    { skipEventSegment: true },
  );
  if (!response.success || !response.data?.ticket) {
    throw new Error(readErrorMessage(response, 'Unable to cancel ticket'));
  }
  return response.data.ticket;
}

// Builds the secure attachment-download URL for a `hashpass-attachment://`
// link embedded in a message's content (see render-html-content.tsx and
// the server's escapeHtml/uploadHelpdeskAttachment in
// app/api/v1/support/frappe/tickets/[ticketId]+api.ts) -- mirrors the same
// base-URL resolution apiClient.request uses for skipEventSegment paths, so
// this always points at the same backend the rest of the support flow does.
export function getSupportAttachmentUrl(ticketId: string, email: string, fileId: string): string {
  const runtimeBaseUrl = getRuntimeApiBaseUrl();
  const base = (runtimeBaseUrl || '/api').replace(/\/$/, '');
  const path = `${BASE_PATH}/${encodeURIComponent(ticketId)}/attachment`.replace(/^\//, '');
  const query = new URLSearchParams({ email, file: fileId }).toString();
  return `${base}/${path}?${query}`;
}
