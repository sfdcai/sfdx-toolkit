import { NextResponse } from 'next/server';
import { marked } from 'marked';
import { readPrivateDoc } from '@/lib/docs';
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

  const url = new URL(req.url);
  const name = url.searchParams.get('name') || '';
  if (!name.endsWith('.md')) {
    return NextResponse.json({ message: 'Invalid file' }, { status: 400 });
  }

  try {
    const content = readPrivateDoc(name);
    const html = marked.parse(content);
    return NextResponse.json({ name, content, html });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'File not found';
    const status = message === 'Invalid path' ? 400 : 404;
    return NextResponse.json({ message }, { status });
  }
}
