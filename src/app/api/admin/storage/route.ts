import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { resolveUserPath } from '@/lib/path';

function folderSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += folderSizeBytes(full);
    } else if (entry.isFile()) {
      total += fs.statSync(full).size;
    }
  });
  return total;
}

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT p.id, p.name, p.user_id as userId, p.source_org as sourceOrg, p.destination_org as destinationOrg, u.email as email FROM projects p JOIN users u ON p.user_id = u.id'
    )
    .all() as Array<{ id: string; name: string; userId: string; sourceOrg: string | null; destinationOrg: string | null; email: string }>;
  const projects = rows
    .map((row) => {
      const projectPath = resolveUserPath(row.userId, 'projects', row.name);
      const bytes = folderSizeBytes(projectPath);
      return { ...row, bytes };
    })
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);
  return NextResponse.json({ projects });
}
