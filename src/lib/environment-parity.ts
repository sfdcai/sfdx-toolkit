import { execFileSync } from 'child_process';
import { getSfCommand, getSfEnv } from './sf';

export interface ParityMetric {
  objectName: string;
  sourceFlsCount: number;
  destFlsCount: number;
  delta: number;
  status: 'IN_SYNC' | 'FLS_MISSING_IN_DEST' | 'FLS_MISSING_IN_SOURCE';
}

export interface EnvironmentParityReport {
  timestamp: string;
  sourceOrg: string;
  destOrg: string;
  metrics: ParityMetric[];
  actionOverrides: {
    appName: string;
    objectName: string;
    actionName: string;
    content: string;
    inSync: boolean;
  }[];
  recommendations: string[];
}

/**
 * Audit Field-Level Security and Action Override parity between two orgs.
 */
export function auditOrgParity(
  sourceOrg: string,
  destOrg: string,
  targetObjects: string[] = ['Case', 'Account', 'Contact', 'Task']
): EnvironmentParityReport {
  const metrics: ParityMetric[] = [];
  const recommendations: string[] = [];

  for (const obj of targetObjects) {
    const q = `SELECT COUNT(Id) cnt FROM FieldPermissions WHERE SobjectType = '${obj}'`;
    let srcCount = 0;
    let dstCount = 0;

    try {
      const srcRes = runSoql(sourceOrg, q);
      srcCount = srcRes?.records?.[0]?.cnt || 0;
    } catch (e) {
      console.error(`Failed to query FLS in ${sourceOrg} for ${obj}`, e);
    }

    try {
      const dstRes = runSoql(destOrg, q);
      dstCount = dstRes?.records?.[0]?.cnt || 0;
    } catch (e) {
      console.error(`Failed to query FLS in ${destOrg} for ${obj}`, e);
    }

    const delta = srcCount - dstCount;
    let status: 'IN_SYNC' | 'FLS_MISSING_IN_DEST' | 'FLS_MISSING_IN_SOURCE' = 'IN_SYNC';
    if (delta > 0) {
      status = 'FLS_MISSING_IN_DEST';
      recommendations.push(
        `Destination org (${destOrg}) is missing ${delta} FieldPermissions on ${obj}. Deploy a Parity PermissionSet or Profile with CustomObject bundled.`
      );
    } else if (delta < 0) {
      status = 'FLS_MISSING_IN_SOURCE';
    }

    metrics.push({
      objectName: obj,
      sourceFlsCount: srcCount,
      destFlsCount: dstCount,
      delta,
      status
    });
  }

  return {
    timestamp: new Date().toISOString(),
    sourceOrg,
    destOrg,
    metrics,
    actionOverrides: [],
    recommendations
  };
}

/**
 * Filter out Data Cloud preview objects and unsupported sandbox features from PermissionSet / Profile metadata.
 */
export const PREVIEW_OBJECT_BLACKLIST = new Set([
  'ActivationTarget',
  'DataAction',
  'DataActionTarget',
  'DataGraph',
  'DataLakeObjectInstance',
  'DataQueryWorkspace',
  'DataQuickAttribute',
  'DataStream',
  'ExtDataShare',
  'ExtDataShareTarget',
  'AsyncOperationTracker',
  'DataModelRelationConstraint'
]);

export function isPermissibleObject(objectName: string): boolean {
  if (PREVIEW_OBJECT_BLACKLIST.has(objectName)) return false;
  // Allow custom objects and core CRM objects
  return (
    objectName.endsWith('__c') ||
    ['Account', 'Contact', 'Case', 'Task', 'Event', 'Scorecard', 'Knowledge__kav', 'User'].includes(objectName)
  );
}

function runSoql(org: string, query: string): any {
  const stdout = execFileSync(getSfCommand(), ['data', 'query', '-o', org, '-q', query, '--json'], {
    encoding: 'utf8',
    env: getSfEnv(),
    maxBuffer: 10 * 1024 * 1024
  });
  const parsed = JSON.parse(stdout);
  return parsed?.result;
}
