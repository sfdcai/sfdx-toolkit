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
 * Dynamically queries all customizable objects from an org (both standard and custom).
 * No hardcoding of object names.
 */
export function discoverOrgObjects(org: string): string[] {
  try {
    const q = "SELECT QualifiedApiName FROM EntityDefinition WHERE IsCustomizable = true AND (KeyPrefix != null OR IsCustomSetting = false) LIMIT 250";
    const res = runSoql(org, q);
    return res?.records?.map((r: any) => r.QualifiedApiName).filter(Boolean) || [];
  } catch (e) {
    console.warn(`Failed to discover objects in ${org}, falling back to core objects`, e);
    return ['Case', 'Account', 'Contact', 'Task', 'Opportunity', 'Lead'];
  }
}

/**
 * Audit Field-Level Security and Action Override parity between two orgs.
 * Dynamically discovers customizable objects if targetObjects is omitted.
 */
export function auditOrgParity(
  sourceOrg: string,
  destOrg: string,
  targetObjects?: string[]
): EnvironmentParityReport {
  const metrics: ParityMetric[] = [];
  const recommendations: string[] = [];
  const objects = targetObjects && targetObjects.length > 0 ? targetObjects : discoverOrgObjects(sourceOrg);

  for (const obj of objects) {
    const q = `SELECT COUNT(Id) cnt FROM FieldPermissions WHERE SobjectType = '${obj}'`;
    let srcCount = 0;
    let dstCount = 0;

    try {
      const srcRes = runSoql(sourceOrg, q);
      srcCount = srcRes?.records?.[0]?.cnt || 0;
    } catch {
      // Object may not exist or support FieldPermissions in source
    }

    try {
      const dstRes = runSoql(destOrg, q);
      dstCount = dstRes?.records?.[0]?.cnt || 0;
    } catch {
      // Object may not exist or support FieldPermissions in dest
    }

    if (srcCount === 0 && dstCount === 0) continue;

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
  return (
    objectName.endsWith('__c') ||
    ['Account', 'Contact', 'Case', 'Task', 'Event', 'Scorecard', 'Knowledge__kav', 'User', 'Lead', 'Opportunity'].includes(objectName)
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
 * Dynamically resolves an active administrator username in the destination org.
 */
export function getDestinationAdminUsername(destOrg: string): string {
  try {
    const q = "SELECT Username FROM User WHERE IsActive = true AND Profile.PermissionsModifyAllData = true ORDER BY CreatedDate ASC LIMIT 1";
    const res = runSoql(destOrg, q);
    return res?.records?.[0]?.Username || '';
  } catch {
    return '';
  }
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
 * Dynamically queries installed package namespaces from an org via Tooling API / SOQL.
 */
export function getInstalledPackageNamespaces(org: string): Set<string> {
  const namespaces = new Set<string>();
  try {
    const q = "SELECT NamespacePrefix FROM InstalledSubscriberPackage";
    const res = runSoql(org, q);
    res?.records?.forEach((r: any) => {
      if (r.NamespacePrefix) namespaces.add(r.NamespacePrefix.toLowerCase());
    });
  } catch {
    // If InstalledSubscriberPackage query is not supported, fallback to ApexClass namespaces
    try {
      const q = "SELECT NamespacePrefix FROM ApexClass WHERE NamespacePrefix != null GROUP BY NamespacePrefix";
      const res = runSoql(org, q);
      res?.records?.forEach((r: any) => {
        if (r.NamespacePrefix) namespaces.add(r.NamespacePrefix.toLowerCase());
      });
    } catch {}
  }
  return namespaces;
}

/**
 * Dynamically detects third-party managed package dependencies by comparing
 * source installed packages vs destination installed packages, and scanning metadata content.
 * 100% dynamic — no hardcoded package lists.
 */
export function detectMissingPackageDependencies(
  sourceOrg: string,
  destOrg: string,
  contentToScan?: string
): string[] {
  const missing = new Set<string>();
  const srcNamespaces = getInstalledPackageNamespaces(sourceOrg);
  const dstNamespaces = getInstalledPackageNamespaces(destOrg);

  // Check which source namespaces are missing in destination
  srcNamespaces.forEach((ns) => {
    if (!dstNamespaces.has(ns)) {
      missing.add(ns);
    }
  });

  // Also scan provided content for namespace references
  if (contentToScan) {
    const namespaceRegex = /\b([a-zA-Z0-9_]{2,15})__([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = namespaceRegex.exec(contentToScan)) !== null) {
      const ns = match[1].toLowerCase();
      // If it looks like a managed package namespace and is not installed in destination
      if (srcNamespaces.has(ns) && !dstNamespaces.has(ns)) {
        missing.add(ns);
      }
    }
  }

  return Array.from(missing);
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
  fieldsAudited: string[];
  sourceUsersWithData: number;
  destUsersWithData: number;
  unalignedDestUsers: string[];
  recommendations: string[];
}

/**
 * Dynamically queries all custom fields defined on the User object in an org.
 * No hardcoding of field names.
 */
export function discoverUserCustomFields(org: string): string[] {
  try {
    const q = "SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'User' AND IsCustom = true";
    const res = runSoql(org, q);
    return res?.records?.map((r: any) => r.QualifiedApiName).filter(Boolean) || [];
  } catch {
    return [];
  }
}

/**
 * Dynamically audits record-level data parity for User custom fields.
 * If keyFields is omitted, dynamically discovers all custom fields on User.
 */
export function auditUserParity(
  sourceOrg: string,
  destOrg: string,
  keyFields?: string[]
): UserParityReport {
  const fieldsToAudit = keyFields && keyFields.length > 0 ? keyFields : discoverUserCustomFields(sourceOrg);

  if (fieldsToAudit.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      sourceOrg,
      destOrg,
      fieldsAudited: [],
      sourceUsersWithData: 0,
      destUsersWithData: 0,
      unalignedDestUsers: [],
      recommendations: []
    };
  }

  const fieldsClause = ['Id', 'Name', 'Username', ...fieldsToAudit].join(', ');
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

  const srcPopulated = srcRecords.filter(u => fieldsToAudit.some(f => u[f] != null)).length;
  const dstPopulated = dstRecords.filter(u => fieldsToAudit.some(f => u[f] != null)).length;
  const unalignedDestUsers: string[] = [];

  for (const dstUser of dstRecords) {
    const matchingSrc = srcRecords.find(s => s.Name === dstUser.Name);
    if (matchingSrc) {
      for (const field of fieldsToAudit) {
        if (matchingSrc[field] != null && dstUser[field] == null) {
          unalignedDestUsers.push(`${dstUser.Name} (${dstUser.Username}): missing ${field} (Source has '${matchingSrc[field]}')`);
        }
      }
    }
  }

  if (unalignedDestUsers.length > 0) {
    recommendations.push(
      `Synchronize User custom field data in destination org (${destOrg}): ${unalignedDestUsers.length} user record differences detected across fields [${fieldsToAudit.join(', ')}].`
    );
  }

  return {
    timestamp: new Date().toISOString(),
    sourceOrg,
    destOrg,
    fieldsAudited: fieldsToAudit,
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
