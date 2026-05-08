import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { normalizeManifestXml } from '@/lib/metadata';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const xml = typeof body?.xml === 'string' ? body.xml : '';
  if (!xml.trim()) {
    return NextResponse.json({ message: 'Manifest xml is required' }, { status: 400 });
  }

  try {
    const normalized = normalizeManifestXml(xml);
    return NextResponse.json({
      message: 'Manifest validated',
      xml: normalized.xml,
      types: normalized.types,
      version: normalized.version,
      warnings: normalized.warnings
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Manifest validation failed';
    return NextResponse.json({ message }, { status: 400 });
  }
}
