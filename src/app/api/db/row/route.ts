import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { deleteRow, insertRow, listTables, tableInfo, updateRow } from '@/lib/db';

function ensureTable(name: string) {
  const tables = listTables();
  if (!tables.includes(name)) {
    throw new Error('Invalid table');
  }
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = body.name as string;
  const data = body.data as Record<string, unknown>;
  if (!name || !data) return NextResponse.json({ message: 'Table name and data required' }, { status: 400 });
  try {
    ensureTable(name);
    const info = tableInfo(name);
    const cols = new Set(info.map((row: any) => row.name));
    const payload: Record<string, unknown> = {};
    Object.keys(data).forEach((key) => {
      if (cols.has(key)) payload[key] = data[key];
    });
    insertRow(name, payload);
    return NextResponse.json({ message: 'Row inserted' });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : 'Insert failed' }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = body.name as string;
  const id = body.id as string;
  const data = body.data as Record<string, unknown>;
  if (!name || !id || !data) return NextResponse.json({ message: 'Table name, id, data required' }, { status: 400 });
  try {
    ensureTable(name);
    const info = tableInfo(name);
    const cols = new Set(info.map((row: any) => row.name));
    const payload: Record<string, unknown> = {};
    Object.keys(data).forEach((key) => {
      if (cols.has(key)) payload[key] = data[key];
    });
    updateRow(name, id, payload);
    return NextResponse.json({ message: 'Row updated' });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : 'Update failed' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = body.name as string;
  const id = body.id as string;
  if (!name || !id) return NextResponse.json({ message: 'Table name and id required' }, { status: 400 });
  try {
    ensureTable(name);
    deleteRow(name, id);
    return NextResponse.json({ message: 'Row deleted' });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : 'Delete failed' }, { status: 400 });
  }
}
