import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { getFeatureFlag, setFeatureFlag } from '@/lib/feature-flags';
import { encryptSecret } from '@/lib/secret-store';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const flag = getFeatureFlag(project.tenantId, 'autonomous_healing');
  const hasApiKey = !!flag.settings?.encryptedKey || !!process.env.GEMINI_API_KEY;
  const maxRetries = flag.settings?.maxRetries ?? 3;

  return NextResponse.json({
    enabled: flag.enabled,
    maxRetries,
    hasApiKey,
    hasGlobalApiKey: !!process.env.GEMINI_API_KEY
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { enabled, maxRetries = 3, geminiApiKey } = body;

  const currentFlag = getFeatureFlag(project.tenantId, 'autonomous_healing');
  const nextSettings: Record<string, any> = {
    ...currentFlag.settings,
    maxRetries: Math.max(1, Math.min(5, Number(maxRetries) || 3))
  };

  if (typeof geminiApiKey === 'string') {
    if (geminiApiKey.trim()) {
      nextSettings.encryptedKey = encryptSecret(geminiApiKey.trim());
    } else {
      delete nextSettings.encryptedKey;
    }
  }

  setFeatureFlag(project.tenantId, 'autonomous_healing', !!enabled, {
    settings: nextSettings
  });

  return NextResponse.json({
    message: 'AI Agent settings updated successfully',
    enabled: !!enabled,
    maxRetries: nextSettings.maxRetries,
    hasApiKey: !!nextSettings.encryptedKey || !!process.env.GEMINI_API_KEY
  });
}
