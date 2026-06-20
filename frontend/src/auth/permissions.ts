import { AuthUser } from '../types';

const rolePermissions: Record<AuthUser['role'], Set<string>> = {
  admin: new Set(['view', 'files:add', 'files:download', 'files:manage', 'mod-icons:manage', 'recipes:edit', 'templates:create', 'templates:edit', 'tasks:manage', 'roles:manage', 'settings:manage', 'debug:manage']),
  moderator: new Set(['view', 'templates:create']),
  default: new Set(['view'])
};

export function can(user: AuthUser | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.is_root_admin) return true;
  return rolePermissions[user.role]?.has(permission) ?? false;
}
