import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject, listOrgs, upsertProject } from '@/lib/store';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { sourceOrg, destinationOrg } = await req.json();
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const orgAliases = listOrgs(user.id).map((org) => org.alias);
  const nextSource = sourceOrg === undefined ? project.sourceOrg : String(sourceOrg || '').trim() || null;
  const nextDestination = destinationOrg === undefined ? project.destinationOrg : String(destinationOrg || '').trim() || null;
  if ((nextSource && !orgAliases.includes(nextSource)) || (nextDestination && !orgAliases.includes(nextDestination))) {
    return NextResponse.json({ message: 'Org alias not available to user' }, { status: 400 });
  }
  if (nextSource && nextDestination && nextSource === nextDestination) {
    return NextResponse.json({ message: 'Source and destination orgs must be different aliases.' }, { status: 400 });
  }
  project.sourceOrg = nextSource;
  project.destinationOrg = nextDestination;
  upsertProject(project);
  return NextResponse.json(project);
}
