import { verifyToken } from './auth';
import { ensureUpgradeSync, findUserById } from './store';

type RequestLike = { headers: { get: (key: string) => string | null } };

export function getAuthUser(req: RequestLike) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  ensureUpgradeSync();
  try {
    const payload = verifyToken(token);
    const fallback = findUserById(payload.id);
    if (!fallback) return null;
    if (payload?.tenantId && payload?.role && payload?.email) {
      return payload;
    }
    return { id: fallback.id, tenantId: fallback.tenantId, email: fallback.email, role: fallback.role };
  } catch {
    return null;
  }
}
