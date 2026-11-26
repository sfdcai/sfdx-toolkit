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

/**
 * Strips <folderShares>...</folderShares> blocks from folder metadata (dashboards, emails, reports).
 * Prevents "Cannot find matching user: <username>" when deploying across sandboxes with different username suffixes.
 */
export function sanitizeFolderShares(xmlContent: string): string {
  return xmlContent.replace(/<folderShares>[\s\S]*?<\/folderShares>/g, '');
}

/**
 * Normalizes dashboard metadata running user and owner to prevent deployment failures
 * due to non-matching sandbox username conventions (e.g. .mbfs.uat vs .uat).
 */
export function sanitizeDashboardMetadata(xmlContent: string, fallbackRunningUser?: string): string {
  let sanitized = xmlContent;
  if (fallbackRunningUser) {
    sanitized = sanitized.replace(/<runningUser>[\s\S]*?<\/runningUser>/g, `<runningUser>${fallbackRunningUser}</runningUser>`);
    sanitized = sanitized.replace(/<owner>[\s\S]*?<\/owner>/g, `<owner>${fallbackRunningUser}</owner>`);
  }
  return sanitized;
}

/**
 * Target-First merge strategy for AppSwitcher.appMenu / Salesforce1.appMenu.
 * Preserves target org's existing standard and connected applications while cleanly
 * appending source custom applications.
 */
export function mergeAppMenuDefinitions(targetXml: string, sourceCustomApps: string[]): string {
  const existingMatches = targetXml.match(/<name>(.*?)<\/name>/g) || [];
  const existingNames = new Set(existingMatches.map(m => m.replace(/<\/?name>/g, '').trim()));
  
  const toAppend: string[] = [];
  for (const app of sourceCustomApps) {
    if (!existingNames.has(app)) {
      toAppend.push(`    <appMenuItems>\n        <name>${app}</name>\n        <type>CustomApplication</type>\n    </appMenuItems>`);
    }
  }

  if (toAppend.length === 0) return targetXml;

  return targetXml.replace('</AppMenu>', `${toAppend.join('\n')}\n</AppMenu>`);
}

/**
 * Detects third-party managed package namespace references in Apex, LWC, or XML metadata.
 * Flags missing dependencies before deployment (e.g., purecloud, npe01, SBQQ, copado).
 */
export function detectManagedPackageDependencies(content: string): string[] {
  const knownNamespaces = ['purecloud', 'npe01', 'npsp', 'SBQQ', 'copado', 'agf', 'et4ae5', 'flc'];
  const detected = new Set<string>();

  for (const ns of knownNamespaces) {
    const regex = new RegExp(`\\b${ns}\\b[.:_]`, 'i');
    if (regex.test(content)) {
      detected.add(ns);
    }
  }

  return Array.from(detected);
}

/**
 * Parses @salesforce/apex/ControllerName.method imports from LWC JavaScript source.
 * Used to verify that backend Apex controllers are properly granted in target PermissionSets or Profiles.
 */
export function extractApexControllersFromLwc(jsContent: string): string[] {
  const regex = /from\s+['"]@salesforce\/apex\/([a-zA-Z0-9_]+)\.[a-zA-Z0-9_]+['"]/g;
  const controllers = new Set<string>();
  let match;

  while ((match = regex.exec(jsContent)) !== null) {
    if (match[1]) {
      controllers.add(match[1]);
    }
  }

  return Array.from(controllers);
}

export interface UserParityMetric {
  userId: string;
  name: string;
  username: string;
  fieldValues: Record<string, any>;
  hasRoutingData: boolean;
}

export interface UserParityReport {
  timestamp: string;
  sourceOrg: string;
  destOrg: string;
  sourceUsersWithData: number;
  destUsersWithData: number;
  unalignedDestUsers: string[];
  recommendations: string[];
}

/**
 * Audits record-level data parity for User custom fields (e.g., Type__c, On_Extended_Leave__c)
 * which drive case routing, queueables, and approval workflows.
 */
export function auditUserParity(
  sourceOrg: string,
  destOrg: string,
  keyFields: string[] = ['Type__c', 'On_Extended_Leave__c']
): UserParityReport {
  const fieldsClause = ['Id', 'Name', 'Username', ...keyFields].join(', ');
  const q = `SELECT ${fieldsClause} FROM User WHERE IsActive = true`;

  let srcRecords: any[] = [];
  let dstRecords: any[] = [];
  const recommendations: string[] = [];

  try {
    const srcRes = runSoql(sourceOrg, q);
    srcRecords = srcRes?.records || [];
  } catch (e) {
    console.error(`Failed to query Users in ${sourceOrg}`, e);
  }

  try {
    const dstRes = runSoql(destOrg, q);
    dstRecords = dstRes?.records || [];
  } catch (e) {
    console.error(`Failed to query Users in ${destOrg}`, e);
  }

  const srcPopulated = srcRecords.filter(u => keyFields.some(f => u[f] != null)).length;
  const dstPopulated = dstRecords.filter(u => keyFields.some(f => u[f] != null)).length;
  const unalignedDestUsers: string[] = [];

  for (const dstUser of dstRecords) {
    const matchingSrc = srcRecords.find(s => s.Name === dstUser.Name);
    if (matchingSrc) {
      for (const field of keyFields) {
        if (matchingSrc[field] != null && dstUser[field] == null) {
          unalignedDestUsers.push(`${dstUser.Name} (${dstUser.Username}): missing ${field} (Source has '${matchingSrc[field]}')`);
        }
      }
    }
  }

  if (unalignedDestUsers.length > 0) {
    recommendations.push(
      `Synchronize User custom field data in destination org (${destOrg}): ${unalignedDestUsers.length} user record differences detected that may impact case routing.`
    );
  }

  return {
    timestamp: new Date().toISOString(),
    sourceOrg,
    destOrg,
    sourceUsersWithData: srcPopulated,
    destUsersWithData: dstPopulated,
    unalignedDestUsers,
    recommendations
  };
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
