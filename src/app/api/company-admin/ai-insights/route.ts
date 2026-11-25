import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api";
import { listAIInsights } from "@/lib/ai-insights";
import { getFeatureFlag } from "@/lib/feature-flags";

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!["company_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const flag = getFeatureFlag(user.tenantId, "ai_insights");
  if (!flag.enabled) {
    return NextResponse.json({ message: "AI Insights feature is not enabled for this tenant" }, { status: 403 });
  }

  const insights = listAIInsights(user.tenantId);
  return NextResponse.json({ insights });
}
