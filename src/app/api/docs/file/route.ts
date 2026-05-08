import { NextResponse } from 'next/server';
import { marked } from 'marked';
import { readPublicDoc } from '@/lib/docs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name') || '';
  if (!name.endsWith('.md')) {
    return NextResponse.json({ message: 'Invalid file' }, { status: 400 });
  }
  try {
    const content = readPublicDoc(name);
    const html = marked.parse(content);
    return NextResponse.json({ name, content, html });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'File not found';
    const status = message === 'Invalid path' ? 400 : 404;
    return NextResponse.json({ message }, { status });
  }
}
