import { NextResponse } from 'next/server';
import { listPrivateDocs } from '@/lib/docs';
import { verifyPrivateDocsToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cookieHeader = req.headers.get('cookie') || '';
  const token = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('private_docs_token='))
    ?.split('=')
    .slice(1)
    .join('=');

  if (!token || !verifyPrivateDocsToken(token)) {
    return NextResponse.json({ message: 'Private docs are locked.' }, { status: 401 });
  }

  return NextResponse.json({ files: listPrivateDocs() });
}
