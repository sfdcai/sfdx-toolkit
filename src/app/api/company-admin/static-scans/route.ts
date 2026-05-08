import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api";
import { listStaticScans } from "@/lib/static-scans";

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!["company_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const scans = listStaticScans(user.tenantId);
  return NextResponse.json({ scans });
}
