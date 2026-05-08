import { logAuditEvent } from './store';

type RequestLike = { headers: { get: (key: string) => string | null } };

export function getRequestIp(req: RequestLike) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim();
  return ip || req.headers.get('x-real-ip') || 'unknown';
}

export function recordAudit(
  req: RequestLike,
  actor: { id: string; tenantId?: string | null } | null,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, any> | null
) {
  const ip = getRequestIp(req);
  const userAgent = req.headers.get('user-agent') || 'unknown';
  return logAuditEvent({
    tenantId: actor?.tenantId ?? null,
    userId: actor?.id ?? null,
    action,
    targetType: targetType || null,
    targetId: targetId || null,
    details: details || null,
    ip,
    userAgent
  });
}
