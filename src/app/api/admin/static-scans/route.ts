import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api";
import { getDefaultTenantId } from "@/lib/store";
import { listStaticScans } from "@/lib/static-scans";

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "super_admin") return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") || getDefaultTenantId() || "tenant_default";
  const scans = listStaticScans(tenantId);
  return NextResponse.json({ tenantId, scans });
}
