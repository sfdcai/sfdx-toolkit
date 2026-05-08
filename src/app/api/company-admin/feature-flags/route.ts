import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api";
import { listTenantFeatures, setFeatureFlag, FeatureKey } from "@/lib/feature-flags";

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!["company_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const features = listTenantFeatures(user.tenantId);
  return NextResponse.json({ features });
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!["company_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const payload = await req.json().catch(() => ({}));
  const { featureKey, enabled } = payload as { featureKey?: FeatureKey; enabled?: boolean };
  if (!featureKey || typeof enabled !== "boolean") {
    return NextResponse.json({ message: "featureKey and enabled are required" }, { status: 400 });
  }
  const feature = setFeatureFlag(user.tenantId, featureKey, enabled);
  return NextResponse.json({ feature });
}
