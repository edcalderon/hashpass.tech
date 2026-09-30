/**
 * Client-side wrapper around app/api/v1/support/frappe/** -- the real Frappe
 * Helpdesk-backed "Contact Support" flow (see app/(shared)/support.tsx).
 * Never talks to Frappe directly: this Frappe instance is staff/agent-only
 * with no public portal, and its service-user credentials live only on the
 * server (see lib/server/frappe-helpdesk.ts).
 */
import { apiClient } from '../api-client';

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
}): Promise<SupportTicket> {
  const response = await apiClient.post(
    BASE_PATH,
    { email: input.email, subject: input.subject, message: input.message, context: input.context },
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
