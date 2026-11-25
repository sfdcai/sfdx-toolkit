import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api";
import { listStaticScans } from "@/lib/static-scans";
import { getFeatureFlag } from "@/lib/feature-flags";

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!["company_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const flag = getFeatureFlag(user.tenantId, "static_scans");
  if (!flag.enabled) {
    return NextResponse.json({ message: "Static Scans feature is not enabled for this tenant" }, { status: 403 });
  }

  const scans = listStaticScans(user.tenantId);
  return NextResponse.json({ scans });
}
