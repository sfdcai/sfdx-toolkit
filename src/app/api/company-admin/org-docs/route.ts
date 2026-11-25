import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api";
import { listOrgDocs } from "@/lib/org-docs";
import { getFeatureFlag } from "@/lib/feature-flags";

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!["company_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const flag = getFeatureFlag(user.tenantId, "org_design_docs");
  if (!flag.enabled) {
    return NextResponse.json({ message: "Org Docs feature is not enabled for this tenant" }, { status: 403 });
  }

  const docs = listOrgDocs(user.tenantId);
  return NextResponse.json({ docs });
}
