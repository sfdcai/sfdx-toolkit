import fs from 'fs';
import path from 'path';
import { execFile, execFileSync, execSync, spawn } from 'node:child_process';
import { apiVersion } from './config';
import { getSfCommand, getSfEnv } from './sf';

export type ManifestType = { name: string; members: string[] };
type RetrieveEntry = { type: string; member: string; status: string };
type RetrieveOutput = { type: string; manifest: string; status: string; error?: string };
export type RetrieveMode = 'chunked' | 'grouped';
export type RetrieveManifestBatch = {
  type: string;
  types: string[];
  label: string;
  path: string;
  mode: RetrieveMode;
};

const TOP_LEVEL_METADATA_MAP: Record<string, string> = {
  appMenus: 'AppMenu',
  applications: 'CustomApplication',
  audience: 'Audience',
  callCenters: 'CallCenter',
  certs: 'Certificate',
  cleanDataServices: 'CleanDataService',
  components: 'ApexComponent',
  contentassets: 'ContentAsset',
  cspTrustedSites: 'CspTrustedSite',
  dataSourceObjects: 'DataSourceObject',
  digitalExperienceConfigs: 'DigitalExperienceConfig',
  digitalExperiences: 'DigitalExperienceBundle',
  duplicateRules: 'DuplicateRule',
  emailservices: 'EmailServicesFunction',
  externalClientApps: 'ExternalClientApplication',
  extlClntAppGlobalOauthSets: 'ExtlClntAppGlobalOauthSettings',
  extlClntAppOauthPolicies: 'ExtlClntAppOauthConfigurablePolicies',
  extlClntAppOauthSettings: 'ExtlClntAppOauthSettings',
  extlClntAppPolicies: 'ExtlClntAppConfigurablePolicies',
  fieldRestrictionRules: 'FieldRestrictionRule',
  flexipages: 'FlexiPage',
  flowDefinitions: 'FlowDefinition',
  installedPackages: 'InstalledPackage',
  letterhead: 'Letterhead',
  managedTopics: 'ManagedTopics',
  matchingRules: 'MatchingRules',
  mktDataConnections: 'MktDataConnection',
  mktDataSources: 'DataSource',
  mktDataTranObjects: 'MktDataTranObject',
  navigationMenus: 'NavigationMenu',
  networkBranding: 'NetworkBranding',
  networks: 'Network',
  objectTranslations: 'CustomObjectTranslation',
  pathAssistants: 'PathAssistant',
  profilePasswordPolicies: 'ProfilePasswordPolicy',
  profileSessionSettings: 'ProfileSessionSetting',
  quickActions: 'QuickAction',
  samlssoconfigs: 'SamlSsoConfig',
  sites: 'CustomSite',
  standardValueSets: 'StandardValueSet',
  tabs: 'CustomTab',
  topicsForObjects: 'TopicsForObjects',
  userCriteria: 'UserCriteria'
};

function ensureDir(targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

export function ensureSfdxProject(rootDir: string, overrideApiVersion?: string) {
  const projectFile = path.join(rootDir, 'sfdx-project.json');
  const forceAppDir = path.join(rootDir, 'force-app');
  if (!fs.existsSync(forceAppDir)) {
    fs.mkdirSync(forceAppDir, { recursive: true });
  }
  const desiredPackageDirectories = [{ path: '.', default: true }];
  const desiredApiVersion = overrideApiVersion || apiVersion;

  if (fs.existsSync(projectFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
      const next = {
        ...existing,
        packageDirectories: desiredPackageDirectories,
        sourceApiVersion: desiredApiVersion
      };
      fs.writeFileSync(projectFile, JSON.stringify(next, null, 2), 'utf8');
      return;
    } catch {
      // Fall through to rewrite an invalid project file.
    }
  }

  const content = {
    packageDirectories: desiredPackageDirectories,
    sourceApiVersion: desiredApiVersion
  };
  fs.writeFileSync(projectFile, JSON.stringify(content, null, 2), 'utf8');
}

export function buildPackageXml(types: ManifestType[] = [], version = apiVersion) {
  const body = types
    .map((type) => {
      const members = (type.members?.length ? type.members : ['*'])
        .map((member) => `    <members>${member}</members>`)
        .join('\n');
      return `  <types>\n${members}\n    <name>${type.name}</name>\n  </types>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${body}\n  <version>${version}</version>\n</Package>`;
}

export function parseManifestComponents(xml = ''): ManifestType[] {
  const blocks = xml.match(/<types>[\s\S]*?<\/types>/g) || [];
  return blocks
    .map((block) => {
      const nameMatch = block.match(/<name>([^<]+)<\/name>/);
      if (!nameMatch) return null;
      const members = [...block.matchAll(/<members>([^<]+)<\/members>/g)].map((m) => m[1]);
      return { name: nameMatch[1].trim(), members: members.length ? members : ['*'] };
    })
    .filter(Boolean) as ManifestType[];
}

export function normalizeManifestXml(xml = '', fallbackVersion = apiVersion) {
  const input = String(xml || '');
  const parsedTypes = parseManifestComponents(input);
  const typesMap = new Map<string, Set<string>>();
  const warnings: string[] = [];

  parsedTypes.forEach((entry) => {
    const typeName = String(entry.name || '').trim();
    if (!typeName) return;
    if (!typesMap.has(typeName)) typesMap.set(typeName, new Set<string>());
    const memberSet = typesMap.get(typeName)!;
    const members = (entry.members?.length ? entry.members : ['*'])
      .map((member) => String(member || '').trim())
      .filter(Boolean);
    members.forEach((member) => {
      if (member === '*') {
        memberSet.clear();
        memberSet.add('*');
        return;
      }
      if (!memberSet.has('*')) memberSet.add(member);
    });
  });

  const normalizedTypes = Array.from(typesMap.entries())
    .map(([name, members]) => ({ name, members: Array.from(members) }))
    .filter((entry) => entry.members.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!normalizedTypes.length) {
    throw new Error('Manifest does not contain any valid metadata types.');
  }

  const versionMatch = input.match(/<version>\s*([^<]+)\s*<\/version>/i);
  const version = (versionMatch?.[1] || '').trim() || fallbackVersion;
  const normalizedXml = buildPackageXml(normalizedTypes, version);

  if (normalizedXml.trim() !== input.trim()) {
    warnings.push('Manifest was normalized: deduplicated members/types and standardized package structure.');
  }

  return {
    xml: normalizedXml,
    types: normalizedTypes,
    version,
    warnings
  };
}

function parseSfJson(stdout = '') {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const lines = trimmed.split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(lines[i]);
      } catch (innerErr) {
        // continue
      }
    }
    return null;
  }
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}



export function buildChunkManifests({
  outputDir,
  types
}: {
  outputDir: string;
  types: ManifestType[];
}) {
  const entries: RetrieveEntry[] = [];
  const chunkManifests: RetrieveManifestBatch[] = [];
  types.forEach((type) => {
    const members = type.members?.length ? type.members : ['*'];
    const safeName = sanitizeFilename(type.name);
    const tempManifest = path.join(outputDir, 'manifest', 'chunks', `type-${safeName}.xml`);
    const xml = buildPackageXml([{ name: type.name, members }]);
    ensureDir(tempManifest);
    fs.writeFileSync(tempManifest, xml, 'utf8');
    chunkManifests.push({ type: type.name, types: [type.name], label: type.name, path: tempManifest, mode: 'chunked' });
    entries.push({ type: type.name, member: members.join(',') || '*', status: 'Queued' });
  });
  return { entries, chunkManifests };
}

function retrieveWeight(type: ManifestType) {
  const weights: Record<string, number> = {
    Profile: 12,
    PermissionSet: 10,
    CustomObject: 10,
    Report: 8,
    Dashboard: 8,
    Flow: 8,
    Workflow: 7,
    EmailTemplate: 7,
    SharingRules: 7,
    Layout: 6,
    RecordType: 6,
    CustomField: 6,
    RemoteSiteSetting: 5
  };
  return weights[type.name] || 2;
}

function buildBatchLabel(types: ManifestType[]) {
  if (types.length === 1) return types[0].name;
  const names = types.map((type) => type.name);
  return `${names[0]} +${names.length - 1}`;
}

export function buildGroupedManifests({
  outputDir,
  types
}: {
  outputDir: string;
  types: ManifestType[];
}) {
  const entries: RetrieveEntry[] = [];
  const chunkManifests: RetrieveManifestBatch[] = [];
  const ordered = [...types]
    .map((type) => ({ ...type, members: type.members?.length ? type.members : ['*'] }))
    .sort((a, b) => retrieveWeight(b) - retrieveWeight(a));
  const groups: ManifestType[][] = [];
  const MAX_WEIGHT = 12;
  const MAX_TYPES_PER_GROUP = 6;

  ordered.forEach((type) => {
    entries.push({ type: type.name, member: type.members.join(',') || '*', status: 'Queued' });
    const weight = retrieveWeight(type);
    if (weight >= 8) {
      groups.push([type]);
      return;
    }
    const current = groups[groups.length - 1];
    const currentWeight = current ? current.reduce((sum, item) => sum + retrieveWeight(item), 0) : 0;
    if (!current || current.length >= MAX_TYPES_PER_GROUP || currentWeight + weight > MAX_WEIGHT) {
      groups.push([type]);
      return;
    }
    current.push(type);
  });

  groups.forEach((group, index) => {
    const label = buildBatchLabel(group);
    const tempManifest = path.join(outputDir, 'manifest', 'chunks', `group-${String(index + 1).padStart(2, '0')}-${sanitizeFilename(label)}.xml`);
    const xml = buildPackageXml(group);
    ensureDir(tempManifest);
    fs.writeFileSync(tempManifest, xml, 'utf8');
    chunkManifests.push({
      type: label,
      types: group.map((item) => item.name),
      label,
      path: tempManifest,
      mode: 'grouped'
    });
  });

  return { entries, chunkManifests };
}

export async function runRetrieveChunked({
  targetLabel,
  targetOrg,
  outputDir,
  apiVersion: orgApiVersion,
  logPath,
  statusPath,
  chunkManifests
}: {
  targetLabel: string;
  targetOrg: string;
  outputDir: string;
  apiVersion?: string;
  logPath: string;
  statusPath: string;
  chunkManifests: RetrieveManifestBatch[];
}) {
  const status = fs.existsSync(statusPath) ? JSON.parse(fs.readFileSync(statusPath, 'utf8')) : {};
  const entries: RetrieveEntry[] = Array.isArray(status.entries) ? status.entries : [];
  const outputs: RetrieveOutput[] = Array.isArray(status.outputs) ? status.outputs : [];
  const versionArg = orgApiVersion ? ['--api-version', orgApiVersion] : [];
  const sfCommand = getSfCommand();
  ensureDir(logPath);
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, `Retrieve started ${new Date().toISOString()}\n`, 'utf8');
  }

  for (const batch of chunkManifests) {
    const statusSnapshot = fs.existsSync(statusPath) ? JSON.parse(fs.readFileSync(statusPath, 'utf8')) : {};
    if (statusSnapshot.cancelRequested) {
      break;
    }
    const tempManifest = batch.path;
    const batchEntries = entries.filter((item) => batch.types.includes(item.type));
    batchEntries.forEach((entry) => {
      entry.status = 'Running';
    });
    const args = [
      'project',
      'retrieve',
      'start',
      '--manifest',
      tempManifest,
      '--target-org',
      targetOrg,
      '--output-dir',
      outputDir,
      ...versionArg,
      '--json'
    ];
    try {
      const child = spawn(sfCommand, args, { cwd: outputDir, env: getSfEnv() });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => {
        stdout += String(data);
      });
      child.stderr.on('data', (data) => {
        stderr += String(data);
      });
      const inProgress = {
        target: targetLabel,
        updatedAt: new Date().toISOString(),
        done: false,
        currentType: batch.label,
        currentPid: child.pid || null,
        entries,
        outputs,
        chunkManifests
      };
      fs.writeFileSync(statusPath, JSON.stringify(inProgress, null, 2), 'utf8');
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve(code ?? 0));
      });
      const latestStatus = fs.existsSync(statusPath) ? JSON.parse(fs.readFileSync(statusPath, 'utf8')) : {};
      if (latestStatus.cancelRequested) {
        batchEntries.forEach((entry) => {
          entry.status = 'Canceled';
        });
        outputs.push({ type: batch.label, manifest: tempManifest, status: 'Canceled' });
        const cancelStatus = {
          target: targetLabel,
          updatedAt: new Date().toISOString(),
          done: true,
          canceled: true,
          entries,
          outputs,
          chunkManifests
        };
        fs.writeFileSync(statusPath, JSON.stringify(cancelStatus, null, 2), 'utf8');
        break;
      }
      const parsed = parseSfJson(stdout.trim());
      if (exitCode !== 0 || (parsed && typeof parsed === 'object' && 'status' in parsed && (parsed as { status?: number }).status !== 0)) {
        const errorText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed || stderr.trim() || stdout.trim(), null, 2);
        batchEntries.forEach((entry) => {
          entry.status = 'Failed';
        });
        outputs.push({ type: batch.label, manifest: tempManifest, status: 'Failed', error: errorText });
        fs.appendFileSync(logPath, `COMMAND: ${sfCommand} ${args.join(' ')}\nERROR: ${errorText}\n`, 'utf8');
        const failedStatus = {
          target: targetLabel,
          updatedAt: new Date().toISOString(),
          done: false,
          currentType: null,
          currentPid: null,
          entries,
          outputs,
          chunkManifests
        };
        fs.writeFileSync(statusPath, JSON.stringify(failedStatus, null, 2), 'utf8');
        continue;
      }
      batchEntries.forEach((entry) => {
        entry.status = 'Retrieved';
      });
      outputs.push({ type: batch.label, manifest: tempManifest, status: 'Retrieved' });
      fs.appendFileSync(
        logPath,
        `COMMAND: ${sfCommand} ${args.join(' ')}\nOUTPUT: ${JSON.stringify(parsed || stdout.trim(), null, 2)}\n`,
        'utf8'
      );
    } catch (err) {
      const stdout = err instanceof Error && (err as Error & { stdout?: string }).stdout ? String((err as Error & { stdout?: string }).stdout) : '';
      const stderr = err instanceof Error && (err as Error & { stderr?: string }).stderr ? String((err as Error & { stderr?: string }).stderr) : (err as Error).message;
      const parsed = parseSfJson(stdout);
      batchEntries.forEach((entry) => {
        entry.status = 'Failed';
      });
      const errorText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed || stderr.trim(), null, 2);
      outputs.push({ type: batch.label, manifest: tempManifest, status: 'Failed', error: errorText });
      fs.appendFileSync(logPath, `COMMAND: ${sfCommand} ${args.join(' ')}\nERROR: ${JSON.stringify(parsed || stderr.trim(), null, 2)}\n`, 'utf8');
    }

    const nextStatus = {
      target: targetLabel,
      updatedAt: new Date().toISOString(),
      done: false,
      currentType: null,
      currentPid: null,
      entries,
      outputs,
      chunkManifests
    };
    fs.writeFileSync(statusPath, JSON.stringify(nextStatus, null, 2), 'utf8');
  }

  const finalStatus = {
    target: targetLabel,
    updatedAt: new Date().toISOString(),
    done: true,
    canceled: fs.existsSync(statusPath) ? Boolean(JSON.parse(fs.readFileSync(statusPath, 'utf8')).cancelRequested) : false,
    entries,
    outputs,
    chunkManifests
  };
  fs.writeFileSync(statusPath, JSON.stringify(finalStatus, null, 2), 'utf8');
}

export function generateManifestFromOrg(manifestPath: string, orgAlias: string, orgApiVersion?: string, cwd?: string) {
  if (!orgAlias) {
    throw new Error('Org alias is required to generate manifest');
  }
  ensureDir(manifestPath);
  const outputDir = path.dirname(manifestPath);
  const name = path.parse(manifestPath).name;
  const sfCommand = getSfCommand();
  const args = ['project', 'generate', 'manifest', '--from-org', orgAlias, '--output-dir', outputDir, '--name', name];
  if (orgApiVersion) {
    args.push('--api-version', orgApiVersion);
  }
  args.push('--json');
  const command = `${sfCommand} ${args.join(' ')}`;
  const timeoutMs = Number(process.env.SF_MANIFEST_TIMEOUT_MS || '60000');
  let stdout = '';
  try {
    stdout = execFileSync(sfCommand, args, {
      encoding: 'utf8',
      cwd,
      env: getSfEnv(),
      timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000
    }).trim();
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err.code === 'ETIMEDOUT' || err.code === 'SIGTERM')) {
      throw new Error(`Manifest generation timed out after ${timeoutMs}ms.`);
    }
    const stderr = err instanceof Error && (err as Error & { stderr?: string }).stderr ? String((err as Error & { stderr?: string }).stderr) : (err as Error).message;
    const output = parseSfJson(stdout) || stdout.trim() || stderr.trim();
    throw new Error(`Manifest generation failed.\n${typeof output === 'string' ? output : JSON.stringify(output, null, 2)}`);
  }
  const output = parseSfJson(stdout) || stdout.trim();
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifest generation failed');
  }
  return { xml: fs.readFileSync(manifestPath, 'utf8'), output, command };
}

export function retrieveMetadataChunked({
  targetLabel,
  targetOrg,
  outputDir,
  apiVersion: orgApiVersion,
  types = []
}: {
  targetLabel: string;
  targetOrg: string;
  outputDir: string;
  apiVersion?: string;
  types: ManifestType[];
}) {
  ensureSfdxProject(outputDir, orgApiVersion);
  const logPath = path.join(outputDir, 'logs', `${targetLabel}-retrieve.log`);
  ensureDir(logPath);
  fs.writeFileSync(logPath, `Retrieve started ${new Date().toISOString()}\n`, 'utf8');
  const entries: { type: string; member: string; status: string }[] = [];
  const outputs: { type: string; manifest: string; status: string; error?: string }[] = [];
  const chunkManifests: RetrieveManifestBatch[] = [];
  const sfCommand = getSfCommand();

  types.forEach((type) => {
    const rawMembers = type.members?.length ? type.members : ['*'];
    const members = rawMembers;
    const safeName = sanitizeFilename(type.name);
    const tempManifest = path.join(outputDir, 'manifest', 'chunks', `type-${safeName}.xml`);
    const xml = buildPackageXml([{ name: type.name, members }]);
    ensureDir(tempManifest);
    fs.writeFileSync(tempManifest, xml, 'utf8');
    chunkManifests.push({ type: type.name, types: [type.name], label: type.name, path: tempManifest, mode: 'chunked' });
    const args = [
      'project',
      'retrieve',
      'start',
      '--manifest',
      tempManifest,
      '--target-org',
      targetOrg,
      '--output-dir',
      outputDir
    ];
    if (orgApiVersion) {
      args.push('--api-version', orgApiVersion);
    }
    args.push('--json');
    const command = `${sfCommand} ${args.join(' ')}`;
    try {
      const stdout = execFileSync(sfCommand, args, { encoding: 'utf8', cwd: outputDir, env: getSfEnv() });
      const parsed = parseSfJson(stdout);
      entries.push({ type: type.name, member: members.join(',') || '*', status: 'Retrieved' });
      outputs.push({ type: type.name, manifest: tempManifest, status: 'Retrieved' });
      fs.appendFileSync(logPath, `COMMAND: ${command}\nOUTPUT: ${JSON.stringify(parsed || stdout.trim(), null, 2)}\n`, 'utf8');
    } catch (err) {
      const stdout = err instanceof Error && (err as Error & { stdout?: string }).stdout ? String((err as Error & { stdout?: string }).stdout) : '';
      const stderr = err instanceof Error && (err as Error & { stderr?: string }).stderr ? String((err as Error & { stderr?: string }).stderr) : (err as Error).message;
      const parsed = parseSfJson(stdout);
      entries.push({ type: type.name, member: members.join(',') || '*', status: 'Failed' });
      const errorText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed || stderr.trim(), null, 2);
      outputs.push({ type: type.name, manifest: tempManifest, status: 'Failed', error: errorText });
      fs.appendFileSync(logPath, `COMMAND: ${command}\nERROR: ${JSON.stringify(parsed || stderr.trim(), null, 2)}\n`, 'utf8');
    }
  });

  const logLines = entries.map((entry) => `${entry.type},${entry.member},${entry.status}`);
  fs.appendFileSync(logPath, `SUMMARY:\n${logLines.join('\n')}\n`, 'utf8');
  return { entries, logPath, outputs, chunkManifests };
}

function walkFiles(baseDir: string) {
  const results: Record<string, string> = {};
  if (!fs.existsSync(baseDir)) return results;
  const stack = [baseDir];
  const ignoredDirs = new Set(['manifest', 'logs', '.sf', '.sfdx', '.git']);
  while (stack.length) {
    const current = stack.pop() as string;
    const stats = fs.statSync(current);
    if (stats.isDirectory()) {
      const name = path.basename(current);
      if (ignoredDirs.has(name)) continue;
      fs.readdirSync(current).forEach((child) => stack.push(path.join(current, child)));
    } else {
      const rel = path.relative(baseDir, current);
      if (rel === 'sfdx-project.json') continue;
      results[rel] = fs.readFileSync(current, 'utf8');
    }
  }
  return results;
}

export function diffWorkspaces(sourceDir: string, destinationDir: string) {
  const src = walkFiles(sourceDir);
  const dest = walkFiles(destinationDir);
  const allPaths = new Set([...Object.keys(src), ...Object.keys(dest)]);
  const changes: { type: string; name: string; status: string; relPath: string }[] = [];
  allPaths.forEach((relPath) => {
    if (!dest[relPath]) {
      changes.push(recordChange(relPath, 'Added'));
    } else if (!src[relPath]) {
      changes.push(recordChange(relPath, 'Removed'));
    } else if (src[relPath] !== dest[relPath]) {
      changes.push(recordChange(relPath, 'Changed'));
    }
  });
  return changes;
}

function stripMeta(name: string) {
  const noMeta = name.replace(/(?:\.meta|-meta)\.xml$/i, '');
  return noMeta.replace(/\.[^.]+$/i, '');
}

export function mapRelPathToMetadata(relPath: string) {
  const parts = relPath.split(path.sep).filter(Boolean);
  const top = parts[0] || '';
  const file = parts[parts.length - 1] || '';
  const base = stripMeta(file);

  if (top === 'classes') return { type: 'ApexClass', name: base };
  if (top === 'triggers') return { type: 'ApexTrigger', name: base };
  if (top === 'pages') return { type: 'ApexPage', name: base };
  if (top === 'components') return { type: 'ApexComponent', name: base };
  if (top === 'flows') return { type: 'Flow', name: base };
  if (top === 'layouts') return { type: 'Layout', name: base };
  if (top === 'workflows') return { type: 'Workflow', name: base };
  if (top === 'sharingRules') return { type: 'SharingRules', name: base };
  if (top === 'businessProcessTypeDefinitions') return { type: 'BusinessProcessTypeDefinition', name: base };
  if (top === 'aura') return { type: 'AuraDefinitionBundle', name: parts[1] || base };
  if (top === 'lwc') return { type: 'LightningComponentBundle', name: parts[1] || base };
  if (top === 'staticresources') return { type: 'StaticResource', name: base };
  if (top === 'labels') return { type: 'CustomLabels', name: 'CustomLabels' };
  if (top === 'permissionsets') return { type: 'PermissionSet', name: base };
  if (top === 'profiles') return { type: 'Profile', name: base };
  if (top === 'globalValueSets') return { type: 'GlobalValueSet', name: base };
  if (top === 'remoteSiteSettings') return { type: 'RemoteSiteSetting', name: base };
  if (top === 'customMetadata') return { type: 'CustomMetadata', name: base };
  if (top === 'moderation') {
    if (/\.keywords-meta\.xml$/i.test(file)) return { type: 'KeywordList', name: base };
    if (/\.rule-meta\.xml$/i.test(file)) return { type: 'ModerationRule', name: base };
  }
  if (TOP_LEVEL_METADATA_MAP[top]) return { type: TOP_LEVEL_METADATA_MAP[top], name: base };
  if (['reports', 'dashboards', 'documents', 'email'].includes(top)) {
    if (/\.reportFolder-meta\.xml$/i.test(file)) return { type: 'ReportFolder', name: base };
    if (/\.dashboardFolder-meta\.xml$/i.test(file)) return { type: 'DashboardFolder', name: base };
    if (/\.emailFolder-meta\.xml$/i.test(file)) return { type: 'EmailFolder', name: base };
    if (/\.documentFolder-meta\.xml$/i.test(file)) return { type: 'DocumentFolder', name: base };
    const folder = parts[1] || 'unfiled';
    return { type: top === 'email' ? 'EmailTemplate' : top.slice(0, -1).replace(/^./, (c) => c.toUpperCase()), name: `${folder}/${base}` };
  }
  if (top === 'objects') {
    const obj = parts[1] || 'Unknown';
    const section = parts[2] || '';
    if (section === 'fields') return { type: 'CustomField', name: `${obj}.${base}` };
    if (section === 'recordTypes') return { type: 'RecordType', name: `${obj}.${base}` };
    if (section === 'validationRules') return { type: 'ValidationRule', name: `${obj}.${base}` };
    if (section === 'compactLayouts') return { type: 'CompactLayout', name: `${obj}.${base}` };
    if (section === 'webLinks') return { type: 'WebLink', name: `${obj}.${base}` };
    if (section === 'listViews') return { type: 'ListView', name: `${obj}.${base}` };
    if (section === 'businessProcesses') return { type: 'BusinessProcess', name: `${obj}.${base}` };
    if (section === 'sharingReasons') return { type: 'SharingReason', name: `${obj}.${base}` };
    if (section === 'fieldSets') return { type: 'FieldSet', name: `${obj}.${base}` };
    if (section === 'objectTranslations') return { type: 'CustomObjectTranslation', name: `${obj}.${base}` };
    if (section === 'topicsForObjects') return { type: 'TopicsForObjects', name: obj };
    if (section === 'sharingCriteriaRules') return { type: 'SharingCriteriaRule', name: `${obj}.${base}` };
    return { type: 'CustomObject', name: obj };
  }
  if (top === 'settings') {
    return { type: `${base}Settings`, name: base };
  }

  const fallbackType = top || 'Unknown';
  const fallbackName = parts.slice(1).join('/') || base || relPath;
  return { type: fallbackType, name: fallbackName };
}

function recordChange(relPath: string, status: string) {
  const mapped = mapRelPathToMetadata(relPath);
  return { type: mapped.type, name: mapped.name, status, relPath };
}

function normalizeChangeForManifest(change: { type: string; name: string; status: string; relPath?: string }) {
  if (change.relPath) {
    const mapped = mapRelPathToMetadata(change.relPath);
    return { ...change, type: mapped.type, name: mapped.name };
  }
  if (change.type === 'Settings') {
    const base = stripMeta(change.name || '');
    if (base) {
      return { ...change, type: `${base}Settings`, name: base };
    }
  }
  return { ...change, type: TOP_LEVEL_METADATA_MAP[change.type] || change.type };
}

export function writeComparisonCsv(csvPath: string, changes: { type: string; name: string; status: string; relPath: string }[]) {
  ensureDir(csvPath);
  const header = 'type,name,status,path';
  const body = changes.map((c) => `${c.type},${c.name},${c.status},${c.relPath}`).join('\n');
  fs.writeFileSync(csvPath, `${header}\n${body}`, 'utf8');
  return csvPath;
}

export function generateDeltaManifest(manifestPath: string, changes: { type: string; name: string; status: string }[]) {
  const included = changes.filter((c) => c.status === 'Added' || c.status === 'Changed');
  const types: Record<string, string[]> = {};
  included.forEach((change) => {
    const normalized = normalizeChangeForManifest(change as { type: string; name: string; status: string; relPath?: string });
    if (!types[normalized.type]) types[normalized.type] = [];
    const name = normalizeMemberName(normalized.name);
    if (name) types[normalized.type].push(name);
  });
  const packageTypes = Object.entries(types).map(([name, members]) => ({
    name,
    members: [...new Set(members)]
  }));
  const xml = buildPackageXml(packageTypes);
  ensureDir(manifestPath);
  fs.writeFileSync(manifestPath, xml, 'utf8');
  return xml;
}

export function generateDestructiveChanges(destructivePath: string, changes: { type: string; name: string; status: string }[]) {
  const removed = changes.filter((c) => c.status === 'Removed');
  if (!removed.length) return null;
  const types: Record<string, string[]> = {};
  removed.forEach((change) => {
    const normalized = normalizeChangeForManifest(change as { type: string; name: string; status: string; relPath?: string });
    if (!types[normalized.type]) types[normalized.type] = [];
    const name = normalizeMemberName(normalized.name);
    if (name) types[normalized.type].push(name);
  });
  const xml = buildPackageXml(
    Object.entries(types).map(([name, members]) => ({ name, members: [...new Set(members)] }))
  );
  ensureDir(destructivePath);
  fs.writeFileSync(destructivePath, xml, 'utf8');
  return xml;
}

export function writeComparisonHtmlReport(
  reportPath: string,
  options: {
    projectId: string;
    projectName: string;
    sourceOrg?: string | null;
    destinationOrg?: string | null;
    changes: { type: string; name: string; status: string; relPath?: string }[];
    generatedAt?: string;
  }
) {
  const { projectId, projectName, changes } = options;
  const generatedAt = options.generatedAt || new Date().toISOString();
  const behaviorTypes = new Set([
    'Flow',
    'ValidationRule',
    'ApexClass',
    'ApexTrigger',
    'Workflow',
    'SharingRules',
    'Settings',
    'PermissionSet',
    'Profile',
    'LightningComponentBundle',
    'AuraDefinitionBundle',
    'ApexPage',
    'ApexComponent'
  ]);
  const baseRisk: Record<string, number> = {
    ApexClass: 4,
    ApexTrigger: 4,
    Flow: 4,
    ValidationRule: 4,
    SharingRules: 4,
    Settings: 4,
    Profile: 4,
    PermissionSet: 4,
    CustomObject: 4,
    CustomField: 4,
    LightningComponentBundle: 3,
    AuraDefinitionBundle: 3,
    ApexPage: 3,
    ApexComponent: 3,
    Workflow: 3,
    Layout: 2,
    RecordType: 2,
    CompactLayout: 2,
    StaticResource: 2,
    CustomLabels: 1
  };
  const impactMap: Record<string, string[]> = {
    ApexClass: ['Automation', 'Integration'],
    ApexTrigger: ['Automation', 'Data Model'],
    Flow: ['Automation', 'UI'],
    ValidationRule: ['Data Integrity'],
    SharingRules: ['Access'],
    Settings: ['Platform'],
    Profile: ['Access'],
    PermissionSet: ['Access'],
    LightningComponentBundle: ['UI'],
    AuraDefinitionBundle: ['UI'],
    ApexPage: ['UI'],
    ApexComponent: ['UI'],
    Workflow: ['Automation'],
    CustomObject: ['Data Model'],
    CustomField: ['Data Model'],
    RecordType: ['Process'],
    Layout: ['UX'],
    StaticResource: ['UX']
  };
  const enriched = changes.map((change) => {
    const base = baseRisk[change.type] || 1;
    let score = base;
    if (change.status === 'Removed') score += 2;
    if (change.status === 'Changed') score += 1;
    if (score > 5) score = 5;
    const label = score >= 5 ? 'critical' : score >= 4 ? 'high' : score >= 3 ? 'medium' : 'low';
    return {
      ...change,
      risk: score,
      riskLabel: label,
      impacts: impactMap[change.type] || ['General']
    };
  });
  const typeStats = new Map<
    string,
    {
      total: number;
      Added: number;
      Changed: number;
      Removed: number;
      items: { type: string; name: string; status: string; relPath?: string; risk: number; riskLabel: string; impacts: string[] }[];
    }
  >();
  const statusBuckets: Record<
    'Added' | 'Changed' | 'Removed',
    { type: string; name: string; status: string; relPath?: string; risk: number; riskLabel: string; impacts: string[] }[]
  > = {
    Added: [],
    Changed: [],
    Removed: []
  };
  const totals = enriched.reduce(
    (acc, change) => {
      acc.total += 1;
      acc[change.status as 'Added' | 'Changed' | 'Removed'] += 1;
      acc.types.set(change.type, (acc.types.get(change.type) || 0) + 1);
      const entry = typeStats.get(change.type) || { total: 0, Added: 0, Changed: 0, Removed: 0, items: [] };
      entry.total += 1;
      entry[change.status as 'Added' | 'Changed' | 'Removed'] += 1;
      entry.items.push(change);
      typeStats.set(change.type, entry);
      statusBuckets[change.status as 'Added' | 'Changed' | 'Removed'].push(change);
      return acc;
    },
    { total: 0, Added: 0, Changed: 0, Removed: 0, types: new Map<string, number>() }
  );
  const topTypes = Array.from(totals.types.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const behavioralChanges = enriched.filter((item) => behaviorTypes.has(item.type));
  const highRiskChanges = enriched.filter((item) => item.risk >= 4);
  const driftCount = totals.Removed;
  const readinessScore = Math.max(0, 100 - highRiskChanges.length * 5 - totals.Removed * 3 - totals.Changed);
  const readinessLabel = readinessScore >= 80 ? 'Ready' : readinessScore >= 60 ? 'Caution' : 'Review';
  const readinessTone = readinessScore >= 80 ? 'good' : readinessScore >= 60 ? 'warn' : 'risk';
  const impactAreas = new Map<string, { count: number; types: Set<string> }>();
  enriched.forEach((change) => {
    change.impacts.forEach((impact) => {
      const entry = impactAreas.get(impact) || { count: 0, types: new Set() };
      entry.count += 1;
      entry.types.add(change.type);
      impactAreas.set(impact, entry);
    });
  });
  const summaryText = totals.total
    ? `${totals.total} total changes detected. ${highRiskChanges.length} high-risk items. ${driftCount} destination-only components suggest drift.`
    : 'No changes detected between source and destination.';
  const typeOptions = ['all', ...Array.from(typeStats.keys()).sort()];
  const riskOptions = ['all', 'critical', 'high', 'medium', 'low'];
  const actionHints = [
    { type: 'ApexClass', hint: 'Run unit tests and validate deployment order.' },
    { type: 'ApexTrigger', hint: 'Validate trigger dependencies and run tests.' },
    { type: 'Flow', hint: 'Confirm entry criteria and activation steps.' },
    { type: 'ValidationRule', hint: 'Review validation logic and impacted objects.' },
    { type: 'Profile', hint: 'Prefer permission sets where possible.' },
    { type: 'PermissionSet', hint: 'Confirm access updates match target users.' }
  ];
  const actionable = actionHints.filter((item) => enriched.some((change) => change.type === item.type));
  const typeRows = Array.from(typeStats.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([type, stats]) => {
      const share = totals.total ? Math.round((stats.total / totals.total) * 100) : 0;
      return `<tr>
        <td>${type}</td>
        <td>${stats.total}</td>
        <td class="added">${stats.Added}</td>
        <td class="changed">${stats.Changed}</td>
        <td class="removed">${stats.Removed}</td>
        <td>
          <div class="bar"><span style="width:${share}%"></span></div>
          <span class="mono">${share}%</span>
        </td>
      </tr>`;
    })
    .join('');
  const rows = enriched
    .map((change) => {
      const diffLink = change.relPath
        ? `<a href="/diff?projectId=${encodeURIComponent(projectId)}&relPath=${encodeURIComponent(change.relPath)}" target="_blank" rel="noopener">View diff</a>`
        : '';
      return `<tr class="filter-item" data-filter-item data-type="${change.type}" data-status="${change.status}" data-risk="${change.riskLabel}" data-text="${change.type} ${change.name} ${change.status} ${change.relPath || ''}">
        <td class="${change.status.toLowerCase()}">${change.status}</td>
        <td><span class="risk ${change.riskLabel}">${change.riskLabel.toUpperCase()}</span></td>
        <td>${change.type}</td>
        <td>${change.name}</td>
        <td class="mono">${change.relPath || ''}</td>
        <td class="link">${diffLink}</td>
      </tr>`;
    })
    .join('');
  const detailSections = Array.from(typeStats.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([type, stats]) => {
      const items = stats.items
        .map((change) => {
          const relPath = change.relPath || '';
          const diffLink = relPath
            ? `<a href="/diff?projectId=${encodeURIComponent(projectId)}&relPath=${encodeURIComponent(relPath)}" target="_blank" rel="noopener">Diff</a>`
            : '';
          return `<div class="detail-item filter-item" data-filter-item data-type="${change.type}" data-status="${change.status}" data-risk="${change.riskLabel}" data-text="${change.type} ${change.name} ${change.status} ${relPath}">
            <span class="tag ${change.status.toLowerCase()}">${change.status}</span>
            <span class="risk ${change.riskLabel}">${change.riskLabel.toUpperCase()}</span>
            <span>${change.name}</span>
            <span class="mono">${relPath}</span>
            <span class="link">${diffLink}</span>
          </div>`;
        })
        .join('');
      return `<details>
        <summary>
          <span>${type}</span>
          <span class="mono">${stats.total} changes · +${stats.Added} / ~${stats.Changed} / -${stats.Removed}</span>
        </summary>
        <div class="detail-list">${items || '<div class="mono">No items.</div>'}</div>
      </details>`;
    })
    .join('');
  const statusSections = (['Added', 'Changed', 'Removed'] as const)
    .map((status) => {
      const items = statusBuckets[status]
        .map((change) => {
          const relPath = change.relPath || '';
          const diffLink = relPath
            ? `<a href="/diff?projectId=${encodeURIComponent(projectId)}&relPath=${encodeURIComponent(relPath)}" target="_blank" rel="noopener">Diff</a>`
            : '';
          return `<div class="detail-item filter-item" data-filter-item data-type="${change.type}" data-status="${change.status}" data-risk="${change.riskLabel}" data-text="${change.type} ${change.name} ${change.status} ${relPath}">
            <span class="tag ${status.toLowerCase()}">${status}</span>
            <span class="risk ${change.riskLabel}">${change.riskLabel.toUpperCase()}</span>
            <span>${change.name}</span>
            <span class="mono">${relPath}</span>
            <span class="link">${diffLink}</span>
          </div>`;
        })
        .join('');
      return `<details>
        <summary>
          <span>${status} (${statusBuckets[status].length})</span>
          <span class="mono">${status === 'Added' ? 'New components' : status === 'Changed' ? 'Modified components' : 'Removed components'}</span>
        </summary>
        <div class="detail-list">${items || '<div class="mono">No items.</div>'}</div>
      </details>`;
    })
    .join('');
  const highRiskRows = highRiskChanges.length
    ? highRiskChanges
        .slice(0, 40)
        .map((item) => `<div class="risk-row">
          <span class="risk ${item.riskLabel}">${item.riskLabel.toUpperCase()}</span>
          <span class="tag ${item.status.toLowerCase()}">${item.status}</span>
          <span>${item.type}</span>
          <span>${item.name}</span>
        </div>`)
        .join('')
    : '<div class="mono">No high-risk changes detected.</div>';
  const impactRows = Array.from(impactAreas.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([impact, stats]) => `<div class="impact-card">
        <div class="impact-title">${impact}</div>
        <div class="impact-count">${stats.count} changes</div>
        <div class="impact-types">${Array.from(stats.types).join(', ')}</div>
      </div>`)
    .join('');
  const execSummary = `<div class="summary-card">
      <div class="summary-title">Executive Summary</div>
      <p>${summaryText}</p>
      <div class="summary-meta">Readiness: <span class="status-pill ${readinessTone}">${readinessLabel} (${readinessScore}%)</span></div>
    </div>`;
  const recommendations = [
    totals.Removed ? 'Destination-only metadata detected. Review hotfixes and reconcile with source.' : '',
    highRiskChanges.length ? 'High-risk changes present. Require manual review and test plan sign-off.' : '',
    behavioralChanges.length ? 'Behavior-affecting components changed. Coordinate QA and regression testing.' : '',
    totals.Changed ? 'Modified components detected. Validate dependencies and deployment order.' : '',
    typeStats.size > 20 ? 'High metadata sprawl. Consider modularizing or batching deploys.' : ''
  ]
    .filter(Boolean)
    .map((item) => `<li>${item}</li>`)
    .join('');
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${projectName} · Comparison Report</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f1116;
        --surface: #151a24;
        --ink: #f1f5f9;
        --muted: #9aa3b2;
        --accent: #22d3ee;
        --accent-strong: #0ea5e9;
        --line: #273041;
        --added: #22c55e;
        --changed: #f59e0b;
        --removed: #f43f5e;
        --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Space Grotesk", "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif;
        background: radial-gradient(circle at top, #1f2a3d 0%, #0f1116 60%, #0a0c12 100%);
        color: var(--ink);
      }
      header {
        padding: 24px 32px;
        border-bottom: 1px solid var(--line);
        background: rgba(15, 18, 26, 0.92);
        position: sticky;
        top: 0;
        backdrop-filter: blur(12px);
      }
      header .title { font-size: 24px; font-weight: 700; }
      header .brand { font-size: 11px; letter-spacing: 0.35em; text-transform: uppercase; color: var(--muted); }
      header .meta { margin-top: 4px; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.2em; }
      main { padding: 28px 32px 64px; max-width: 1200px; margin: 0 auto; }
      .grid { display: grid; gap: 20px; }
      .grid.cols-3 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
      .grid.cols-2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .card {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
      }
      .stat {
        font-size: 28px;
        font-weight: 700;
        margin-top: 8px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border: 1px solid var(--line);
      }
      .badge.added { color: var(--added); border-color: rgba(34, 197, 94, 0.3); background: rgba(34, 197, 94, 0.1); }
      .badge.changed { color: var(--changed); border-color: rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.12); }
      .badge.removed { color: var(--removed); border-color: rgba(244, 63, 94, 0.3); background: rgba(244, 63, 94, 0.12); }
      .table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .table th, .table td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }
      .table th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; }
      .added { color: var(--added); font-weight: 600; }
      .changed { color: var(--changed); font-weight: 600; }
      .removed { color: var(--removed); font-weight: 600; }
      .mono { font-family: var(--mono); font-size: 11px; color: var(--muted); }
      .link a { color: var(--accent); text-decoration: none; font-weight: 600; }
      .link a:hover { color: var(--accent-strong); }
      .pill {
        padding: 6px 10px;
        border-radius: 12px;
        background: rgba(8, 12, 18, 0.7);
        border: 1px solid var(--line);
        font-size: 12px;
      }
      .section-title {
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        color: var(--muted);
        margin-bottom: 12px;
      }
      .bar {
        background: rgba(148, 163, 184, 0.2);
        border-radius: 999px;
        height: 6px;
        overflow: hidden;
        margin-bottom: 6px;
      }
      .bar span {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, var(--accent), var(--accent-strong));
      }
      details {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px 16px;
        background: rgba(12, 16, 24, 0.6);
        margin-bottom: 12px;
      }
      summary {
        display: flex;
        justify-content: space-between;
        cursor: pointer;
        font-weight: 600;
      }
      .detail-list {
        margin-top: 12px;
        display: grid;
        gap: 8px;
      }
      .detail-item {
        display: grid;
        grid-template-columns: 90px 90px 1fr 1.2fr 70px;
        gap: 10px;
        align-items: center;
        font-size: 12px;
        border-bottom: 1px dashed var(--line);
        padding-bottom: 8px;
      }
      .detail-item:last-child { border-bottom: none; padding-bottom: 0; }
      .tag {
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        border: 1px solid var(--line);
      }
      .tag.added { background: rgba(22, 163, 74, 0.15); color: #4ade80; border-color: rgba(22, 163, 74, 0.35); }
      .tag.changed { background: rgba(14, 116, 144, 0.15); color: #38bdf8; border-color: rgba(14, 116, 144, 0.35); }
      .tag.removed { background: rgba(190, 18, 60, 0.15); color: #fb7185; border-color: rgba(190, 18, 60, 0.35); }
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-bottom: 16px;
      }
      .filters input,
      .filters select {
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(8, 12, 18, 0.7);
        color: var(--ink);
        padding: 8px 12px;
        font-size: 12px;
      }
      .risk {
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .risk.critical { color: #f87171; border-color: rgba(248, 113, 113, 0.5); background: rgba(248, 113, 113, 0.12); }
      .risk.high { color: #fbbf24; border-color: rgba(251, 191, 36, 0.5); background: rgba(251, 191, 36, 0.12); }
      .risk.medium { color: #60a5fa; border-color: rgba(96, 165, 250, 0.5); background: rgba(96, 165, 250, 0.12); }
      .risk.low { color: #34d399; border-color: rgba(52, 211, 153, 0.5); background: rgba(52, 211, 153, 0.12); }
      .summary-card {
        background: rgba(9, 12, 19, 0.75);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 20px;
      }
      .summary-title {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.25em;
        color: var(--muted);
        margin-bottom: 10px;
      }
      .summary-meta { margin-top: 12px; font-size: 13px; color: var(--muted); }
      .status-pill {
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--line);
        font-weight: 600;
      }
      .status-pill.good { color: #22d3ee; border-color: rgba(34, 211, 238, 0.4); }
      .status-pill.warn { color: #fbbf24; border-color: rgba(251, 191, 36, 0.4); }
      .status-pill.risk { color: #fb7185; border-color: rgba(251, 113, 133, 0.4); }
      .impact-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .impact-card {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px;
        background: rgba(10, 14, 22, 0.7);
      }
      .impact-title {
        font-weight: 600;
        margin-bottom: 6px;
      }
      .impact-count { font-size: 20px; font-weight: 600; }
      .impact-types { font-size: 11px; color: var(--muted); margin-top: 4px; }
      .view-switch {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .view-switch button {
        border-radius: 999px;
        border: 1px solid var(--line);
        padding: 8px 14px;
        background: rgba(8, 12, 18, 0.7);
        color: var(--ink);
        font-size: 12px;
        cursor: pointer;
      }
      .view-switch button.active {
        border-color: var(--accent-strong);
        color: var(--accent);
        box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.2);
      }
      .risk-row {
        display: grid;
        grid-template-columns: 90px 80px 140px 1fr;
        gap: 8px;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px dashed var(--line);
        font-size: 12px;
      }
      .risk-row:last-child { border-bottom: none; }
      .note {
        font-size: 12px;
        color: var(--muted);
        margin-top: 6px;
      }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">SFDX DevOps Platform</div>
      <div class="title">${projectName} · Comparison Report</div>
      <div class="meta">Generated ${generatedAt}</div>
    </header>
    <main>
      ${execSummary}

      <section class="grid cols-2" style="margin-top: 24px;">
        <div class="card">
          <div class="section-title">Change Overview</div>
          <div class="stat">${totals.total}</div>
          <div class="pill">Added ${totals.Added} · Changed ${totals.Changed} · Removed ${totals.Removed}</div>
          <div class="note">Structural differences highlight missing or extra metadata between environments.</div>
        </div>
        <div class="card">
          <div class="section-title">Behavioral Differences</div>
          <div class="stat">${behavioralChanges.length}</div>
          <div class="pill">Flows · Apex · Validation · Access</div>
          <div class="note">Behavioral changes affect logic, automation, and user-facing outcomes.</div>
        </div>
      </section>

      <section class="grid cols-2" style="margin-top: 16px;">
        <div class="card">
          <div class="section-title">Environment Drift</div>
          <div class="stat">${driftCount}</div>
          <div class="pill">Destination-only components</div>
          <div class="note">Extra metadata in destination suggests direct hotfixes or config drift.</div>
        </div>
        <div class="card">
          <div class="section-title">Deployment Readiness</div>
          <div class="stat">${readinessScore}%</div>
          <div class="pill">Status · <span class="status-pill ${readinessTone}">${readinessLabel}</span></div>
          <div class="note">Readiness blends risk, drift, and behavioral impact.</div>
        </div>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Scope</div>
        <div class="grid cols-3">
          <div class="pill">Project ID · ${projectId}</div>
          <div class="pill">Types · ${typeStats.size}</div>
          <div class="pill">Source Org · ${options.sourceOrg || 'Not set'}</div>
          <div class="pill">Destination Org · ${options.destinationOrg || 'Not set'}</div>
        </div>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Actionable Focus</div>
        ${actionable.length ? actionable.map((item) => `<div class="pill">${item.type}: ${item.hint}</div>`).join('') : '<div class="pill">No critical components detected.</div>'}
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Status Breakdown</div>
        <div class="grid cols-3">
          <div class="badge added">Added ${totals.Added}</div>
          <div class="badge changed">Changed ${totals.Changed}</div>
          <div class="badge removed">Removed ${totals.Removed}</div>
        </div>
        <div class="grid cols-3" style="margin-top: 12px;">
          <div class="pill">Added ${totals.total ? Math.round((totals.Added / totals.total) * 100) : 0}%</div>
          <div class="pill">Changed ${totals.total ? Math.round((totals.Changed / totals.total) * 100) : 0}%</div>
          <div class="pill">Removed ${totals.total ? Math.round((totals.Removed / totals.total) * 100) : 0}%</div>
        </div>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Top Types</div>
        <div class="grid cols-3">
          ${topTypes.map((entry) => `<div class="pill">${entry[0]} · ${entry[1]}</div>`).join('')}
        </div>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Type Breakdown</div>
        <table class="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Total</th>
              <th>Added</th>
              <th>Changed</th>
              <th>Removed</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            ${typeRows}
          </tbody>
        </table>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">High-Risk Changes</div>
        <div class="note">Why this matters: high-risk items often need manual review, tests, and staged rollout.</div>
        <div style="margin-top: 12px;">
          ${highRiskRows}
        </div>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Dependency Impact Map</div>
        <div class="impact-grid">
          ${impactRows || '<div class="mono">No dependency impact detected.</div>'}
        </div>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Role-Based Intelligence</div>
        <div class="view-switch">
          <button type="button" data-view-button="developer" class="active">Developer View</button>
          <button type="button" data-view-button="architect">Architect View</button>
          <button type="button" data-view-button="product">Product Owner View</button>
        </div>
        <div data-view="developer" style="margin-top: 16px;">
          <div class="note">Line-level diffs, deployment readiness, and missing dependencies.</div>
          <div class="grid cols-2" style="margin-top: 12px;">
            <div class="pill">Code Changes · ${enriched.filter((item) => ['ApexClass', 'ApexTrigger', 'LightningComponentBundle', 'AuraDefinitionBundle'].includes(item.type)).length}</div>
            <div class="pill">Automation Changes · ${behavioralChanges.length}</div>
          </div>
        </div>
        <div data-view="architect" style="margin-top: 16px; display: none;">
          <div class="note">Dependency risk, metadata sprawl, and long-term maintainability signals.</div>
          <div class="grid cols-2" style="margin-top: 12px;">
            <div class="pill">High-Risk Components · ${highRiskChanges.length}</div>
            <div class="pill">Metadata Types · ${typeStats.size}</div>
          </div>
        </div>
        <div data-view="product" style="margin-top: 16px; display: none;">
          <div class="note">Business impact focus, release readiness, and blockers.</div>
          <div class="grid cols-2" style="margin-top: 12px;">
            <div class="pill">Flow/Automation · ${enriched.filter((item) => ['Flow', 'Workflow'].includes(item.type)).length}</div>
            <div class="pill">Access Changes · ${enriched.filter((item) => ['Profile', 'PermissionSet', 'SharingRules'].includes(item.type)).length}</div>
          </div>
        </div>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Change Explorer Filters</div>
        <div class="filters">
          <input type="search" id="filter-search" placeholder="Search by component or path" />
          <select id="filter-type">
            ${typeOptions.map((type) => `<option value="${type}">${type === 'all' ? 'All types' : type}</option>`).join('')}
          </select>
          <select id="filter-status">
            <option value="all">All statuses</option>
            <option value="Added">Added</option>
            <option value="Changed">Changed</option>
            <option value="Removed">Removed</option>
          </select>
          <select id="filter-risk">
            ${riskOptions.map((risk) => `<option value="${risk}">${risk === 'all' ? 'All risk levels' : risk}</option>`).join('')}
          </select>
        </div>
        <div class="note">Filters apply to all change lists in this report.</div>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Change Explorer (By Type)</div>
        ${detailSections}
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Change Explorer (By Status)</div>
        ${statusSections}
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Full Change List</div>
        <table class="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Risk</th>
              <th>Type</th>
              <th>Name</th>
              <th>Path</th>
              <th>Diff</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Recommendations</div>
        <ul>${recommendations || '<li>No specific recommendations at this time.</li>'}</ul>
      </section>

      <section class="card" style="margin-top: 24px;">
        <div class="section-title">Audit Trail</div>
        <div class="grid cols-2">
          <div class="pill">Generated · ${generatedAt}</div>
          <div class="pill">Report Version · 2.0</div>
          <div class="pill">Project · ${projectName}</div>
          <div class="pill">Source Org · ${options.sourceOrg || 'Not set'}</div>
          <div class="pill">Destination Org · ${options.destinationOrg || 'Not set'}</div>
        </div>
      </section>
    </main>
    <script>
      const viewButtons = Array.from(document.querySelectorAll('[data-view-button]'));
      const viewSections = Array.from(document.querySelectorAll('[data-view]'));
      function setView(view) {
        viewButtons.forEach((button) => {
          button.classList.toggle('active', button.getAttribute('data-view-button') === view);
        });
        viewSections.forEach((section) => {
          section.style.display = section.getAttribute('data-view') === view ? 'block' : 'none';
        });
      }
      viewButtons.forEach((button) => {
        button.addEventListener('click', () => setView(button.getAttribute('data-view-button')));
      });
      const filterSearch = document.getElementById('filter-search');
      const filterType = document.getElementById('filter-type');
      const filterStatus = document.getElementById('filter-status');
      const filterRisk = document.getElementById('filter-risk');
      function applyFilters() {
        const search = (filterSearch && filterSearch.value || '').toLowerCase();
        const type = filterType && filterType.value || 'all';
        const status = filterStatus && filterStatus.value || 'all';
        const risk = filterRisk && filterRisk.value || 'all';
        document.querySelectorAll('[data-filter-item]').forEach((item) => {
          const text = (item.getAttribute('data-text') || '').toLowerCase();
          const itemType = item.getAttribute('data-type') || '';
          const itemStatus = item.getAttribute('data-status') || '';
          const itemRisk = item.getAttribute('data-risk') || '';
          const matches =
            (!search || text.includes(search)) &&
            (type === 'all' || itemType === type) &&
            (status === 'all' || itemStatus === status) &&
            (risk === 'all' || itemRisk === risk);
          item.style.display = matches ? '' : 'none';
        });
      }
      [filterSearch, filterType, filterStatus, filterRisk].forEach((control) => {
        if (control) control.addEventListener('input', applyFilters);
      });
      setView('developer');
    </script>
  </body>
</html>`;
  ensureDir(reportPath);
  fs.writeFileSync(reportPath, html, 'utf8');
  return html;
}

function normalizeMemberName(raw: string) {
  if (!raw) return '';
  let name = raw.trim();
  name = name.replace(/\.meta\.xml$/i, '');
  name = name.replace(/-meta$/i, '');
  return name;
}
