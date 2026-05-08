import crypto from "crypto";
import { getDb } from "./db";
import type { FeatureKey } from "./feature-flags";

export type AIInsightRecord = {
  id: string;
  tenantId: string;
  jobId?: string | null;
  projectId?: string | null;
  featureKey: FeatureKey;
  summary: string;
  recommendation: string;
  rawError?: string | null;
  severity?: "info" | "warning" | "error";
  createdAt: string;
};

export function insertAIInsight(record: Omit<AIInsightRecord, "id" | "createdAt">) {
  const db = getDb();
  const entry: AIInsightRecord = {
    ...record,
    id: crypto.randomUUID().replace(/-/g,"").substring(0, 16),
    createdAt: new Date().toISOString()
  };
  db.prepare(
    "INSERT INTO ai_insights (id, tenant_id, job_id, project_id, feature_key, summary, recommendation, raw_error, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(entry.id, entry.tenantId, entry.jobId, entry.projectId, entry.featureKey, entry.summary, entry.recommendation, entry.rawError, entry.severity, entry.createdAt);
  return entry;
}

export function listAIInsights(tenantId: string) {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, tenant_id as tenantId, job_id as jobId, project_id as projectId, feature_key as featureKey, summary, recommendation, raw_error as rawError, severity, created_at as createdAt FROM ai_insights WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50"
    )
    .all(tenantId) as AIInsightRecord[];
}

export function getInsightForJob(jobId: string) {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, tenant_id as tenantId, job_id as jobId, project_id as projectId, feature_key as featureKey, summary, recommendation, raw_error as rawError, severity, created_at as createdAt FROM ai_insights WHERE job_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(jobId) as AIInsightRecord | undefined;
}
