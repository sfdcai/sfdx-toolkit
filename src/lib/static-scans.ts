import crypto from "crypto";
import { getDb } from "./db";

export type ScanFinding = {
  file: string;
  line: number;
  severity: "info" | "warning" | "error";
  rule: string;
  message: string;
};

export type StaticScanRecord = {
  id: string;
  tenantId: string;
  userId?: string | null;
  status: "queued" | "running" | "failed" | "done";
  findings: ScanFinding[];
  reportPath?: string | null;
  summary?: string | null;
  createdAt: string;
};

export function insertStaticScan(record: Omit<StaticScanRecord, "id" | "createdAt">) {
  const db = getDb();
  const entry: StaticScanRecord = {
    ...record,
    id: crypto.randomUUID().replace(/-/g,"").substring(0, 16),
    createdAt: new Date().toISOString()
  };
  db.prepare(
    "INSERT INTO static_scans (id, tenant_id, user_id, status, findings_json, report_path, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(entry.id, entry.tenantId, entry.userId, entry.status, JSON.stringify(entry.findings), entry.reportPath, entry.summary, entry.createdAt);
  return entry;
}

export function listStaticScans(tenantId: string) {
  const db = getDb();
  return db
    .prepare("SELECT id, tenant_id as tenantId, user_id as userId, status, findings_json, report_path as reportPath, summary, created_at as createdAt FROM static_scans WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(tenantId)
    .map((row: any) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      status: row.status,
      findings: JSON.parse(row.findings_json || "[]") as ScanFinding[],
      reportPath: row.reportPath,
      summary: row.summary,
      createdAt: row.createdAt
    })) as StaticScanRecord[];
}
