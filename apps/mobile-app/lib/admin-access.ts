import { apiClient } from './api-client';
import type { AdminRole } from './admin-utils';
import type { EventRole, EventRoleGrant } from './event-admin-access';
import {
  getEffectiveRole,
  type EffectiveRole,
  type EffectiveRoleName,
} from './role-summary';

export type AdminAccess = {
  globalRole: AdminRole | null;
  eventRoles: EventRoleGrant[];
  effectiveRole: EffectiveRole;
};

const isAdminRole = (value: unknown): value is AdminRole =>
  value === 'super_admin' || value === 'admin';

const isEventRole = (value: unknown): value is EventRole =>
  value === 'event_admin' || value === 'moderator';

const isEffectiveRoleName = (value: unknown): value is EffectiveRoleName =>
  value === 'super_admin' || value === 'admin' || value === 'event_admin' || value === 'moderator' || value === 'user';

const readEffectiveRole = (value: unknown, globalRole: AdminRole | null, eventRoles: EventRoleGrant[]): EffectiveRole => {
  if (!value || typeof value !== 'object') return getEffectiveRole(globalRole, eventRoles);

  const candidate = value as { role?: unknown; scope?: unknown; eventIds?: unknown };
  if (!isEffectiveRoleName(candidate.role) ||
      (candidate.scope !== 'global' && candidate.scope !== 'event' && candidate.scope !== 'none') ||
      !Array.isArray(candidate.eventIds) ||
      !candidate.eventIds.every((eventId) => typeof eventId === 'string')) {
    return getEffectiveRole(globalRole, eventRoles);
  }

  return {
    role: candidate.role,
    scope: candidate.scope,
    eventIds: candidate.eventIds,
  };
};

/** Fetch the signed-in user's access through the provider-aware API. */
export async function getCurrentAdminAccess(): Promise<AdminAccess> {
  const result = await apiClient.get('/admin/access', { skipEventSegment: true });
  if (!result.success) {
    throw new Error(result.error || 'Unable to load administrative access');
  }

  const access = (result.data as { data?: unknown })?.data as {
    globalRole?: unknown;
    eventRoles?: unknown;
    effectiveRole?: unknown;
  } | undefined;

  const eventRoles = Array.isArray(access?.eventRoles)
    ? access.eventRoles.filter((grant): grant is EventRoleGrant => {
      if (!grant || typeof grant !== 'object') return false;
      const value = grant as { eventId?: unknown; role?: unknown };
      return typeof value.eventId === 'string' && isEventRole(value.role);
    })
    : [];

  const globalRoleCandidate = access?.globalRole;
  const globalRole = isAdminRole(globalRoleCandidate) ? globalRoleCandidate : null;
  return { globalRole, eventRoles, effectiveRole: readEffectiveRole(access?.effectiveRole, globalRole, eventRoles) };
}
