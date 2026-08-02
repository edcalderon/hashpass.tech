import type { AdminAccess } from './admin-access';
import type { EventRoleGrant } from './event-admin-access';

const GLOBAL_ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
} as const;

const EVENT_ROLE_LABELS = {
  event_admin: 'Event Admin',
  moderator: 'Moderator',
} as const;

/**
 * A profile is descriptive, not an authorization decision: return every
 * active assignment in a stable order instead of collapsing them to the
 * effective/highest role used by permission checks.
 */
export function getProfileRoleLabels(access: AdminAccess | null, isSpeaker: boolean): string[] {
  const labels: string[] = [];

  for (const role of ['super_admin', 'admin'] as const) {
    if (access?.globalRoles.includes(role)) labels.push(GLOBAL_ROLE_LABELS[role]);
  }

  const eventRoles: EventRoleGrant[] = [...(access?.eventRoles || [])].sort((left, right) => {
    if (left.eventId !== right.eventId) return left.eventId.localeCompare(right.eventId);
    return left.role === 'event_admin' ? -1 : right.role === 'event_admin' ? 1 : 0;
  });
  for (const grant of eventRoles) {
    const eventRole = grant.role as keyof typeof EVENT_ROLE_LABELS;
    labels.push(`${EVENT_ROLE_LABELS[eventRole]} · ${grant.eventId}`);
  }

  if (isSpeaker) labels.push('Speaker');
  return [...new Set(labels)];
}
