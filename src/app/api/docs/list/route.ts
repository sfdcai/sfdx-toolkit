import { NextResponse } from 'next/server';
import { listPublicDocs } from '@/lib/docs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ files: listPublicDocs() });
}
