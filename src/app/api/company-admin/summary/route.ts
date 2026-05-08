import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getPlanLimits, getTenantById, getTenantUsage } from '@/lib/store';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['company_admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const tenant = getTenantById(user.tenantId);
  if (!tenant) return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });
  const usage = getTenantUsage(user.tenantId);
  const limits = getPlanLimits();
  const planLimits = limits[tenant.plan] || limits.free;
  return NextResponse.json({
    tenant,
    usage,
    limits: {
      maxUsers: tenant.maxUsers ?? planLimits.maxUsers,
      maxProjects: tenant.maxProjects ?? planLimits.maxProjects,
      maxOrgs: tenant.maxOrgs ?? planLimits.maxOrgs,
      maxStorageBytes: tenant.maxStorageBytes ?? planLimits.maxStorageBytes,
      maxRetrieves: tenant.maxRetrieves ?? planLimits.maxRetrieves,
      maxDeploys: tenant.maxDeploys ?? planLimits.maxDeploys
    }
  });
}
