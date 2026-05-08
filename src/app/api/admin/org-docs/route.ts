import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api";
import { getDefaultTenantId } from "@/lib/store";
import { listOrgDocs } from "@/lib/org-docs";

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "super_admin") return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") || getDefaultTenantId() || "tenant_default";
  const docs = listOrgDocs(tenantId);
  return NextResponse.json({ tenantId, docs });
}
