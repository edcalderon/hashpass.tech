export type GlobalAdminRole = 'super_admin' | 'admin';
export type EventAdminRole = 'event_admin' | 'moderator';
export type EffectiveRoleName = GlobalAdminRole | EventAdminRole | 'user';

export type EffectiveRole = {
  role: EffectiveRoleName;
  scope: 'global' | 'event' | 'none';
  /** Event IDs to which the effective event-scoped role applies. */
  eventIds: string[];
};

/** Treat malformed and past expiry values as inactive rather than granting access. */
export function isRoleActive(expiresAt: string | null | undefined, now = Date.now()): boolean {
  return !expiresAt || new Date(expiresAt).getTime() > now;
}

type EventRoleGrant = {
  eventId: string;
  role: EventAdminRole;
};

const uniqueEventIdsForRole = (eventRoles: readonly EventRoleGrant[], role: EventAdminRole) =>
  [...new Set(eventRoles
    .filter((grant) => grant.role === role)
    .map((grant) => grant.eventId))]
    .sort();

/**
 * Determines the one role shown to a person while retaining its event scope.
 * Server authorization must still check the underlying global/event grants.
 */
export function getEffectiveRole(
  globalRole: GlobalAdminRole | null,
  eventRoles: readonly EventRoleGrant[],
): EffectiveRole {
  if (globalRole) {
    return { role: globalRole, scope: 'global', eventIds: [] };
  }

  const eventAdminEventIds = uniqueEventIdsForRole(eventRoles, 'event_admin');
  if (eventAdminEventIds.length > 0) {
    return { role: 'event_admin', scope: 'event', eventIds: eventAdminEventIds };
  }

  const moderatorEventIds = uniqueEventIdsForRole(eventRoles, 'moderator');
  if (moderatorEventIds.length > 0) {
    return { role: 'moderator', scope: 'event', eventIds: moderatorEventIds };
  }

  return { role: 'user', scope: 'none', eventIds: [] };
}

export function formatEffectiveRole(role: EffectiveRole): string {
  const label = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    event_admin: 'Event Admin',
    moderator: 'Moderator',
    user: 'General User',
  }[role.role];

  if (role.scope !== 'event' || role.eventIds.length === 0) return label;
  return `${label} · ${role.eventIds.join(', ').toUpperCase()}`;
}
