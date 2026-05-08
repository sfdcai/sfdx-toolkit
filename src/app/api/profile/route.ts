import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getUserProfile, updateUserProfile } from '@/lib/store';
import { recordAudit } from '@/lib/audit';
import { isValidUrl } from '@/lib/validate';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const profile = getUserProfile(user.id);
  if (!profile) return NextResponse.json({ message: 'User not found' }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { name, company, social } = await req.json().catch(() => ({}));
  const nextSocial = typeof social === 'object' && social ? social : {};
  const entries = Object.entries(nextSocial);
  for (const [key, value] of entries) {
    if (!value) continue;
    if (typeof value !== 'string' || !isValidUrl(value)) {
      return NextResponse.json({ message: `Invalid URL for ${key}` }, { status: 400 });
    }
  }
  const updated = updateUserProfile(user.id, {
    name: typeof name === 'string' ? name.trim() : undefined,
    company: typeof company === 'string' ? company.trim() : undefined,
    social: nextSocial
  });
  recordAudit(req as any, user, 'profile.update', 'user', user.id, { fields: ['name', 'company', 'social'] });
  return NextResponse.json({ message: 'Profile updated', profile: updated });
}
