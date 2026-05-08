import { NextResponse } from 'next/server';
import { marked } from 'marked';
import { readUserGuide } from '@/lib/docs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const content = readUserGuide();
    const html = marked.parse(content);
    return NextResponse.json({ name: 'user-guide.md', content, html });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'File not found';
    return NextResponse.json({ message }, { status: 404 });
  }
}
