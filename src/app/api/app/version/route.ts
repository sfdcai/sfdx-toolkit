import { NextResponse } from "next/server";
import { getAppVersionInfo } from "@/lib/app-version";

export async function GET() {
  const info = getAppVersionInfo();
  return NextResponse.json({
    status: "ok",
    version: info.version,
    baseVersion: info.baseVersion,
    hash: info.hash,
    buildTimestamp: info.buildTimestamp,
    host: "Dell Precision 5520 (homelab.amit.com)",
    nodeVersion: process.version,
    uptime: process.uptime()
  });
}
