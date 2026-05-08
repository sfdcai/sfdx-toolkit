import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getPlanLimits, getTenantById, getTenantUsage } from '@/lib/store';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const tenant = getTenantById(user.tenantId);
  if (!tenant) return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });
  const usage = getTenantUsage(user.tenantId);
  const limits = getPlanLimits();
  const planLimits = limits[tenant.plan] || limits.free;
  return NextResponse.json({
    plan: tenant.plan,
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
