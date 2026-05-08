import { getDb } from "./db";

export type FeatureKey = "ai_insights" | "static_scans" | "org_design_docs";

export type FeatureDefinition = {
  key: FeatureKey;
  label: string;
  description: string;
  costPerUnit: number;
  unitName: string;
};

export const featureDefinitions: Record<FeatureKey, FeatureDefinition> = {
  ai_insights: {
    key: "ai_insights",
    label: "AI Deployment Insights",
    description: "Translate deployment/compare failures into recovery steps and record the reasoning.",
    costPerUnit: 0.05,
    unitName: "deployment insight"
  },
  static_scans: {
    key: "static_scans",
    label: "Enhanced Static Scan",
    description: "Run automated static code analysis and export runnable reports for security/quality defects.",
    costPerUnit: 0.1,
    unitName: "scan run"
  },
  org_design_docs: {
    key: "org_design_docs",
    label: "Org Design Document",
    description: "Generate an AI-curated org/project design document so devs can skip manual write-ups.",
    costPerUnit: 0.2,
    unitName: "document"
  }
};

export type FeatureFlagRecord = {
  tenantId: string;
  featureKey: FeatureKey;
  enabled: boolean;
  cost: number;
  settings?: Record<string, unknown>;
};

export type FeatureFlagView = FeatureFlagRecord & {
  label: string;
  description: string;
  unitName: string;
};

export function getFeatureFlag(tenantId: string, featureKey: FeatureKey): FeatureFlagRecord {
  const db = getDb();
  const row = db
    .prepare("SELECT enabled, cost, settings_json FROM tenant_features WHERE tenant_id = ? AND feature_key = ?")
    .get(tenantId, featureKey) as { enabled: number; cost: number; settings_json?: string } | undefined;
  const definition = featureDefinitions[featureKey];
  if (row) {
    return {
      tenantId,
      featureKey,
      enabled: Boolean(row.enabled),
      cost: row.cost ?? definition.costPerUnit,
      settings: row.settings_json ? JSON.parse(row.settings_json) : undefined
    };
  }
  return {
    tenantId,
    featureKey,
    enabled: false,
    cost: definition.costPerUnit,
    settings: undefined
  };
}

function asFeatureView(record: FeatureFlagRecord): FeatureFlagView {
  const definition = featureDefinitions[record.featureKey];
  return {
    ...record,
    label: definition.label,
    description: definition.description,
    unitName: definition.unitName
  };
}

export function listTenantFeatures(tenantId: string): FeatureFlagView[] {
  return (Object.keys(featureDefinitions) as FeatureKey[]).map((key) => asFeatureView(getFeatureFlag(tenantId, key)));
}

export function setFeatureFlag(
  tenantId: string,
  featureKey: FeatureKey,
  enabled: boolean,
  payload: { cost?: number; settings?: Record<string, unknown> } = {}
): FeatureFlagRecord {
  const db = getDb();
  const insert = db.prepare(
    "INSERT OR REPLACE INTO tenant_features (tenant_id, feature_key, enabled, cost, settings_json) VALUES (?, ?, ?, ?, ?)"
  );
  insert.run(tenantId, featureKey, enabled ? 1 : 0, payload.cost ?? featureDefinitions[featureKey].costPerUnit, payload.settings ? JSON.stringify(payload.settings) : null);
  return asFeatureView(getFeatureFlag(tenantId, featureKey));
}
