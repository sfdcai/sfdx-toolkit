import { NextResponse } from 'next/server';
import { privateDocsPassword } from '@/lib/config';
import { signPrivateDocsToken } from '@/lib/auth';
import { getPrivateDocsPassword } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  const stored = getPrivateDocsPassword();
  const required = stored || privateDocsPassword;
  if (!required) {
    return NextResponse.json({ message: 'Private docs password is not configured on the server.' }, { status: 503 });
  }
  if (!password || String(password) !== required) {
    return NextResponse.json({ message: 'Invalid password.' }, { status: 401 });
  }
  const response = NextResponse.json({ message: 'Private docs unlocked.' });
  response.cookies.set('private_docs_token', signPrivateDocsToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 60 * 60 * 12
  });
  return response;
}
