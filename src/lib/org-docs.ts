import crypto from "crypto";
import { getDb } from "./db";

export type OrgDocRecord = {
  id: string;
  tenantId: string;
  projectId?: string | null;
  docPath: string;
  summary?: string | null;
  createdAt: string;
};

export function insertOrgDoc(record: Omit<OrgDocRecord, "id" | "createdAt">) {
  const db = getDb();
  const entry: OrgDocRecord = {
    ...record,
    id: crypto.randomUUID().replace(/-/g,"").substring(0, 16),
    createdAt: new Date().toISOString()
  };
  db.prepare(
    "INSERT INTO org_design_docs (id, tenant_id, project_id, doc_path, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(entry.id, entry.tenantId, entry.projectId, entry.docPath, entry.summary, entry.createdAt);
  return entry;
}

export function listOrgDocs(tenantId: string) {
  const db = getDb();
  return db
    .prepare("SELECT id, tenant_id as tenantId, project_id as projectId, doc_path as docPath, summary, created_at as createdAt FROM org_design_docs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(tenantId) as OrgDocRecord[];
}
