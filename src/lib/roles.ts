import type { UserRole } from './store';

export function isSuperAdmin(role?: UserRole | null) {
  return role === 'super_admin';
}

export function isCompanyAdmin(role?: UserRole | null) {
  return role === 'company_admin';
}

export function isTenantAdmin(role?: UserRole | null) {
  return role === 'super_admin' || role === 'company_admin';
}
