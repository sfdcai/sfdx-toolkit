import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api";
import { getDefaultTenantId } from "@/lib/store";
import { listTenantFeatures, setFeatureFlag, FeatureKey } from "@/lib/feature-flags";

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "super_admin") return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") || getDefaultTenantId() || "tenant_default";
  const features = listTenantFeatures(tenantId);
  return NextResponse.json({ tenantId, features });
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "super_admin") return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const payload = await req.json().catch(() => ({}));
  const { tenantId, featureKey, enabled } = payload as { tenantId?: string; featureKey?: FeatureKey; enabled?: boolean };
  if (!tenantId || !featureKey || typeof enabled !== "boolean") {
    return NextResponse.json({ message: "tenantId, featureKey, and enabled are required" }, { status: 400 });
  }
  const feature = setFeatureFlag(tenantId, featureKey, enabled);
  return NextResponse.json({ feature });
}
