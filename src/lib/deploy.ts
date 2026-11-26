import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { buildPackageXml, parseManifestComponents, parseMetadataPath, METADATA_FOLDERS } from './metadata';
import { getSfCommand, getSfEnv } from './sf';
import { sanitizeFolderShares, sanitizeDashboardMetadata } from './environment-parity';

export interface DeployArgs {
  projectPath: string;
  deployLogPath: string;
  manifestPath: string;
  testLevel?: string;
  runTests?: string[];
  checkOnly?: boolean;
  autoRetry?: boolean;
  retryLimit?: number;
  components?: string[];
  targetOrg: string;
  apiVersion?: string;
  sourcePath?: string;
  selectionPaths?: string[];
  ignoreDestructive?: boolean;
  destinationPath?: string;
  deployType?: 'delta' | 'full' | 'manifest';
  manifestContent?: string;
  // Explicit destructive-changes manifest to apply. `null` = none.
  // When omitted (undefined), falls back to the legacy shared deploy/manifest/destructiveChanges.xml.
  destructivePath?: string | null;
}

const DECOMPOSED_CHILD_TYPE_PARENTS: Record<string, string> = {
  BusinessProcess: 'CustomObject',
  CompactLayout: 'CustomObject',
  CustomField: 'CustomObject',
  CustomObjectTranslation: 'CustomObject',
  FieldSet: 'CustomObject',
  ListView: 'CustomObject',
  RecordType: 'CustomObject',
  SharingCriteriaRule: 'CustomObject',
  SharingReason: 'CustomObject',
  TopicsForObjects: 'CustomObject',
  ValidationRule: 'CustomObject',
  WebLink: 'CustomObject'
};

function ensureDir(targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

function appendLog(logPath: string, line: string, buffer: string[]) {
  buffer.push(line);
  try {
    ensureDir(logPath);
    fs.appendFileSync(logPath, line + "\n", "utf8");
  } catch {}
}

function parseSfJson(stdout = '') {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractFailures(parsed: Record<string, any> | null) {
  const failures =
    parsed?.result?.details?.componentFailures ||
    parsed?.result?.details?.componentFailure ||
    parsed?.details?.componentFailures ||
    parsed?.details?.componentFailure ||
    [];
  const list = Array.isArray(failures) ? failures : [failures];
  return list
    .filter(Boolean)
    .map((item: any) => {
      const type = item.componentType || item.type || 'Unknown';
      const name = item.fullName || item.fullname || item.name || 'Unknown';
      return `${type}:${name}`;
    });
}

function parseManifestTypes(manifestPath: string) {
  if (!fs.existsSync(manifestPath)) return [];
  return parseManifestComponents(fs.readFileSync(manifestPath, 'utf8'));
}

function filterManifest(manifestPath: string, excludedComponents: string[], outputPath: string) {
  const typeMap = parseManifestTypes(manifestPath);
  const excluded = new Set(excludedComponents);
  const filtered = typeMap
    .map((type) => {
      const members = type.members.filter((member) => !excluded.has(`${type.name}:${member}`));
      return { name: type.name, members };
    })
    .filter((type) => type.members.length > 0);
  const xml = buildPackageXml(filtered);
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, xml, 'utf8');
  return outputPath;
}

function filterManifestTypes(manifestPath: string, excludedTypes: string[], outputPath: string) {
  const excluded = new Set(excludedTypes);
  const filtered = parseManifestTypes(manifestPath).filter((type) => !excluded.has(type.name));
  const xml = buildPackageXml(filtered);
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, xml, 'utf8');
  return { outputPath, remainingTypes: filtered };
}

function resolveRegistryCandidates() {
  const homeDir = process.env.HOME || os.homedir() || '/tmp';
  return [
    path.join(homeDir, '.local', 'share', 'sf', 'client'),
    path.join(path.dirname(path.dirname(getSfCommand())), 'node_modules', '@salesforce', 'source-deploy-retrieve', 'lib', 'src', 'registry', 'metadataRegistry.json')
  ];
}

function findLatestRegistryFile() {
  const candidates: string[] = [];

  resolveRegistryCandidates().forEach((candidate) => {
    if (!fs.existsSync(candidate)) return;
    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      candidates.push(candidate);
      return;
    }
    fs.readdirSync(candidate, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isDirectory()) return;
      const registryPath = path.join(candidate, entry.name, 'node_modules', '@salesforce', 'source-deploy-retrieve', 'lib', 'src', 'registry', 'metadataRegistry.json');
      if (fs.existsSync(registryPath)) candidates.push(registryPath);
    });
  });

  return candidates
    .map((candidate) => ({ candidate, mtimeMs: fs.statSync(candidate).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.candidate;
}

export function loadSupportedMetadataTypes() {
  const registryPath = findLatestRegistryFile();
  if (!registryPath) return { supportedTypes: null as Set<string> | null, registryPath: null };

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const supportedTypes = new Set<string>();
    Object.values(parsed?.types || {}).forEach((entry: any) => {
      if (entry?.name) supportedTypes.add(String(entry.name));
    });
    return { supportedTypes, registryPath };
  } catch (err) {
    return { supportedTypes: null, registryPath: null };
  }
}

const GLOBAL_TYPE_BLACKLIST = new Set([
  'TopicsForObjects',
  'ManagedTopics',
  'InstalledPackage'
]);

export function filterUnsupportedMetadataTypes(
  manifestTypes: { name: string; members: string[] }[],
  supportedTypes: Set<string> | null
) {
  const filteredTypes = manifestTypes.filter((type) => {
    if (GLOBAL_TYPE_BLACKLIST.has(type.name)) {
      return false;
    }
    if (!supportedTypes) return true;
    if (supportedTypes.has(type.name)) return true;
    // Decomposed child types (e.g. CustomField, RecordType) are not listed as
    // standalone supported types; keep them when their parent type is supported.
    const parent = DECOMPOSED_CHILD_TYPE_PARENTS[type.name];
    return parent ? supportedTypes.has(parent) : false;
  });

  const skippedTypes = manifestTypes
    .filter((t) => !filteredTypes.some((ft) => ft.name === t.name))
    .map((t) => t.name);

  return {
    filteredTypes,
    skippedTypes
  };
}

export function parseMissingRegistryType(error: unknown) {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? String((error as { message: string }).message)
        : error && typeof error === 'object' && 'error' in error && typeof (error as { error?: unknown }).error === 'string'
          ? String((error as { error: string }).error)
          : '';
  const match = message.match(/Missing metadata type definition in registry for id '([^']+)'/);
  return match?.[1] || null;
}

export function shouldContinueAutoRetry(
  autoRetry: boolean,
  attempts: number,
  failedComponents: string[],
  previousFailedComponents: string[],
  maxAttempts = 3
) {
  if (!autoRetry) return false;
  if (!failedComponents.length) return false;
  if (attempts >= maxAttempts) return false;
  if (attempts === 1) return true;
  if (!previousFailedComponents.length) return true;
  const current = [...new Set(failedComponents)].sort();
  const previous = [...new Set(previousFailedComponents)].sort();
  return current.join('\n') !== previous.join('\n');
}

function runDeployCommand(args: string[], cwd: string) {
  const stdout = execFileSync(getSfCommand(), args, {
    encoding: 'utf8',
    cwd,
    env: getSfEnv(),
    maxBuffer: 50 * 1024 * 1024
  });

  const parsed = parseSfJson(stdout);
  return { parsed, raw: stdout.trim() };
}

export function deployWithCli({
  projectPath,
  deployLogPath,
  manifestPath,
  testLevel = 'NoTestRun',
  runTests = [],
  checkOnly = false,
  autoRetry = true,
  retryLimit = 3,
  components = [],
  targetOrg,
  apiVersion,
  sourcePath,
  selectionPaths = [],
  ignoreDestructive = false,
  destinationPath,
  deployType = 'delta',
  manifestContent,
  destructivePath
}: DeployArgs) {
  ensureDir(deployLogPath);
  let logLines: string[] = [];

  if (sourcePath && (deployType === 'full' || (deployType === 'manifest' && manifestContent) || (selectionPaths && selectionPaths.length > 0))) {
    const forceAppDir = path.join(projectPath, 'force-app');
    if (fs.existsSync(forceAppDir)) {
      fs.rmSync(forceAppDir, { recursive: true, force: true });
    }
    fs.mkdirSync(forceAppDir, { recursive: true });

    if (deployType === 'full') {
      const staged = stageFullSource(sourcePath, projectPath);
      appendLog(deployLogPath, `STAGED FULL SOURCE: ${staged.copied} copied`, logLines);
      
      const sfCommand = getSfCommand();
      try {
        execFileSync(sfCommand, ['project', 'generate', 'manifest', '--source-dir', 'force-app', '--output-dir', 'manifest'], {
          cwd: projectPath,
          encoding: 'utf8'
        });
        manifestPath = path.join(projectPath, 'manifest', 'package.xml');
        appendLog(deployLogPath, `GENERATED MANIFEST: manifest/package.xml`, logLines);
      } catch (err: any) {
        appendLog(deployLogPath, `ERROR GENERATING MANIFEST: ${err.message}`, logLines);
      }
    } else if (deployType === 'manifest' && manifestContent) {
      const customManifestDir = path.join(projectPath, 'manifest');
      fs.mkdirSync(customManifestDir, { recursive: true });
      fs.writeFileSync(path.join(customManifestDir, 'package.xml'), manifestContent, 'utf8');
      manifestPath = path.join(customManifestDir, 'package.xml');

      const staged = stageManifestFiles(sourcePath, projectPath, manifestContent);
      appendLog(deployLogPath, `STAGED MANIFEST FILES: ${staged.copied} copied, ${staged.missing} missing`, logLines);
      if (staged.missingList.length) {
        appendLog(deployLogPath, `MISSING: ${staged.missingList.join(', ')}`, logLines);
      }
    } else {
      if (selectionPaths.length) {
        const staged = stageDeltaFiles(sourcePath, projectPath, selectionPaths, destinationPath);
        appendLog(deployLogPath, `STAGED DELTA: ${staged.copied} copied, ${staged.missing} missing`, logLines);
        if (staged.missingList.length) {
          appendLog(deployLogPath, `MISSING: ${staged.missingList.join(', ')}`, logLines);
        }
      }
    }
  }

  const versionArg = apiVersion ? ['--api-version', apiVersion] : [];
  let currentManifest = manifestPath;
  if (components.length) {
    const types = components.map((entry) => {
      const [name, member] = entry.split(':');
      return { name, members: [member || '*'] };
    });
    currentManifest = path.join(path.dirname(manifestPath), 'component-override.xml');
    const xml = buildPackageXml(types);
    fs.writeFileSync(currentManifest, xml, 'utf8');
  }

  const emptySharingRulesToExclude: string[] = [];
  const manifestComponents = parseManifestTypes(currentManifest);
  manifestComponents.forEach(comp => {
    if (comp.name === 'SharingRules') {
      comp.members.forEach(member => {
        const rel = `force-app/main/default/sharingRules/${member}.sharingRules-meta.xml`;
        const fullSrc = path.join(sourcePath || projectPath, rel);
        if (isEmptySharingRules(fullSrc)) {
          emptySharingRulesToExclude.push(`SharingRules:${member}`);
        }
      });
    }
  });

  if (emptySharingRulesToExclude.length) {
    const filteredManifestPath = path.join(path.dirname(manifestPath), 'no-empty-sharing-rules-package.xml');
    filterManifest(currentManifest, emptySharingRulesToExclude, filteredManifestPath);
    currentManifest = filteredManifestPath;
    appendLog(deployLogPath, `HEALING: Excluded empty sharing rules: ${emptySharingRulesToExclude.join(', ')}`, logLines);
  }


  const testArgs = testLevel ? ['--test-level', testLevel] : [];
  const testsArg = runTests.length ? ['--tests', runTests.join(',')] : [];
  const dryRunArg = checkOnly ? ['--dry-run'] : [];
  // Use the explicitly provided destructive manifest. `null` means "no deletions".
  // `undefined` (omitted) keeps the legacy shared-file behavior for backward compatibility.
  const effectiveDestructivePath = destructivePath !== undefined
    ? destructivePath
    : path.join(projectPath, 'manifest', 'destructiveChanges.xml');
  const currentDestructiveArg = (!ignoreDestructive && effectiveDestructivePath && fs.existsSync(effectiveDestructivePath))
    ? ['--post-destructive-changes', effectiveDestructivePath]
    : [];

  const sfCommand = getSfCommand();
  const unsupportedSummary = { unsupportedTypes: [] as string[] };
  let registryFiltered = false;

  let result: Record<string, unknown> | string | null = null;
  let status = 'Failed';
  let failedComponents: string[] = [];
  let attempts = 1;

  while (true) {
    const deployArgs = ['project', 'deploy', 'start', '--manifest', currentManifest, '--target-org', targetOrg, ...testArgs, ...testsArg, ...dryRunArg, ...currentDestructiveArg, ...versionArg, '--json'];
    const command = `${sfCommand} ${deployArgs.join(' ')}`;
    try {
      const run = runDeployCommand(deployArgs, projectPath);
      result = {
        ...((run.parsed as Record<string, unknown>) || { raw: run.raw }),
        ...unsupportedSummary
      };
      failedComponents = extractFailures(run.parsed as Record<string, any>);
      status = (run.parsed as Record<string, any>)?.status === 0 ? 'Succeeded' : 'Failed';
      appendLog(deployLogPath, `COMMAND: ${command}`, logLines);
      appendLog(deployLogPath, `OUTPUT: ${JSON.stringify(result, null, 2)}`, logLines);
      break;
    } catch (err) {
      const stdout = err instanceof Error && (err as Error & { stdout?: string }).stdout ? String((err as Error & { stdout?: string }).stdout) : '';
      const stderr = err instanceof Error && (err as Error & { stderr?: string }).stderr ? String((err as Error & { stderr?: string }).stderr) : (err as Error).message;
      const parsed = parseSfJson(stdout);
      const errorPayload = parsed || { error: stderr.trim() };
      const missingRegistryType = parseMissingRegistryType(errorPayload);
      appendLog(deployLogPath, `COMMAND: ${command}`, logLines);
      appendLog(deployLogPath, `ERROR: ${JSON.stringify({ ...errorPayload, ...unsupportedSummary }, null, 2)}`, logLines);

      if (missingRegistryType && !registryFiltered) {
        registryFiltered = true;
        const filtered = filterManifestTypes(currentManifest, [missingRegistryType], path.join(path.dirname(manifestPath), 'registry-filtered-package.xml'));
        currentManifest = filtered.outputPath;
        unsupportedSummary.unsupportedTypes.push(missingRegistryType);
        fs.appendFileSync(deployLogPath, `\nRegistry mismatch: removing metadata type ${missingRegistryType} and retrying...\n`);
        continue;
      }

      result = { ...errorPayload, ...unsupportedSummary };
      failedComponents = extractFailures(parsed as Record<string, any>);
      status = 'Failed';
      break;
    }
  }

  if (status !== 'Succeeded' && autoRetry && failedComponents.length) {
    let previousFailed = [...failedComponents];
    const retryResults: any[] = [];

    while (shouldContinueAutoRetry(autoRetry, attempts, failedComponents, previousFailed, retryLimit)) {
      attempts++;
      previousFailed = [...failedComponents];

      // Get failures from the last attempt (either initial result or the last retry result)
      const lastRunParsed = retryResults.length > 0 
        ? retryResults[retryResults.length - 1] 
        : (result as Record<string, any>);
      const failuresList = lastRunParsed?.result?.details?.componentFailures || 
                           lastRunParsed?.result?.details?.componentFailure || 
                           lastRunParsed?.details?.componentFailures || 
                           lastRunParsed?.details?.componentFailure || 
                           [];
      const normalizedFailures = Array.isArray(failuresList) ? failuresList : [failuresList];

      // Extract and stage missing dependencies from source repository
      const missingDeps = extractMissingDependencies(normalizedFailures, sourcePath || projectPath);
      const addedComponents: string[] = [];
      missingDeps.forEach(dep => {
        const relPaths = resolveSourcePathsForComponent(dep.type, dep.fullName);
        let success = false;
        relPaths.forEach(relPath => {
          const srcFile = path.join(sourcePath || projectPath, relPath);
          const destFile = path.join(destinationPath || projectPath, relPath);
          if (fs.existsSync(srcFile)) {
            success = true;
            fs.mkdirSync(path.dirname(destFile), { recursive: true });
            if (fs.statSync(srcFile).isDirectory()) {
              fs.cpSync(srcFile, destFile, { recursive: true });
            } else if (shouldSanitize(relPath)) {
              const content = fs.readFileSync(srcFile, 'utf8');
              const sanitized = sanitizeMetadataContent(relPath, content, sourcePath || projectPath, destinationPath || projectPath);
              fs.writeFileSync(destFile, sanitized, 'utf8');
            } else {
              fs.copyFileSync(srcFile, destFile);
            }
            
            // Also copy companion file(s) if they exist
            let companionPaths: string[] = [];
            if (relPath.includes('staticresources')) {
              const baseDir = path.dirname(relPath);
              const name = path.basename(relPath, '.resource-meta.xml');
              const fullBaseDir = path.join(sourcePath || projectPath, baseDir);
              if (fs.existsSync(fullBaseDir)) {
                try {
                  const files = fs.readdirSync(fullBaseDir);
                  for (const file of files) {
                    if (file !== `${name}.resource-meta.xml` && (file === name || file.startsWith(`${name}.`))) {
                      companionPaths.push(path.join(baseDir, file));
                    }
                  }
                } catch {}
              }
            } else {
              const companion = relPath.endsWith('-meta.xml') ? relPath.replace(/-meta\.xml$/, '') : `${relPath}-meta.xml`;
              companionPaths.push(companion);
            }

            companionPaths.forEach(compRelPath => {
              const srcCompanion = path.join(sourcePath || projectPath, compRelPath);
              const destCompanion = path.join(destinationPath || projectPath, compRelPath);
              if (fs.existsSync(srcCompanion)) {
                if (fs.statSync(srcCompanion).isDirectory()) {
                  fs.cpSync(srcCompanion, destCompanion, { recursive: true });
                } else if (shouldSanitize(compRelPath)) {
                  const content = fs.readFileSync(srcCompanion, 'utf8');
                  const sanitized = sanitizeMetadataContent(compRelPath, content, sourcePath || projectPath, destinationPath || projectPath);
                  fs.writeFileSync(destCompanion, sanitized, 'utf8');
                } else {
                  fs.copyFileSync(srcCompanion, destCompanion);
                }
              }
            });
          }
        });
        if (success) {
          addedComponents.push(`${dep.type}:${dep.fullName}`);
          appendLog(deployLogPath, `AUTO-HEAL: Staged missing dependency ${dep.type}:${dep.fullName} from source`, logLines);
        }
      });

      // Remove added components from failedComponents so they are deployed
      if (addedComponents.length) {
        failedComponents = failedComponents.filter(c => !addedComponents.includes(c));
      }

      const retryManifest = path.join(path.dirname(manifestPath), `auto-retry-package-pass${attempts}.xml`);
      filterAndAppendManifest(currentManifest, failedComponents, addedComponents, retryManifest);
      currentManifest = retryManifest;

      const retryArgs = ['project', 'deploy', 'start', '--manifest', currentManifest, '--target-org', targetOrg, ...testArgs, ...testsArg, ...dryRunArg, ...currentDestructiveArg, ...versionArg, '--json'];
      const retryCommand = `${sfCommand} ${retryArgs.join(' ')}`;
      try {
        const retryRun = runDeployCommand(retryArgs, projectPath);
        const retryResult = (retryRun.parsed as Record<string, unknown>) || { raw: retryRun.raw };
        appendLog(deployLogPath, `RETRY COMMAND ${attempts}: ${retryCommand}`, logLines);
        appendLog(deployLogPath, `RETRY OUTPUT ${attempts}: ${JSON.stringify(retryResult, null, 2)}`, logLines);
        status = (retryRun.parsed as Record<string, any>)?.status === 0 ? 'SucceededWithRetry' : 'Failed';
        result = { initial: result, retries: retryResults, ...unsupportedSummary };
        failedComponents = extractFailures(retryRun.parsed as Record<string, any>) || failedComponents;
        if (status === 'SucceededWithRetry') {
          break;
        }
      } catch (retryErr) {
        const stdout = retryErr instanceof Error && (retryErr as Error & { stdout?: string }).stdout ? String((retryErr as Error & { stdout?: string }).stdout) : '';
        const stderr = retryErr instanceof Error && (retryErr as Error & { stderr?: string }).stderr ? String((retryErr as Error & { stderr?: string }).stderr) : (retryErr as Error).message;
        const parsed = parseSfJson(stdout);
        const retryPayload = parsed || { error: stderr.trim() };
        appendLog(deployLogPath, `RETRY COMMAND ${attempts}: ${retryCommand}`, logLines);
        appendLog(deployLogPath, `RETRY ERROR ${attempts}: ${JSON.stringify({ ...retryPayload, ...unsupportedSummary }, null, 2)}`, logLines);
        retryResults.push(retryPayload);
        result = { initial: result, retries: retryResults, ...unsupportedSummary };
        failedComponents = extractFailures(parsed as Record<string, any>) || failedComponents;
        status = 'Failed';
      }
    }
  }

  fs.writeFileSync(deployLogPath, logLines.join('\n'), 'utf8');
  return {
    status,
    attempts,
    failedComponents,
    manifestPath: currentManifest,
    deployLogPath,
    output: result
  };
}

function collectBundleFiles(sourceDir: string, currentDir: string, expanded: Set<string>) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectBundleFiles(sourceDir, fullPath, expanded);
    } else if (entry.isFile()) {
      const rel = path.relative(sourceDir, fullPath);
      expanded.add(rel);
    }
  }
}

export function stageDeltaFiles(sourceDir: string, deployDir: string, relPaths: string[], destinationDir?: string) {
  const stagedPaths = expandStagePaths(sourceDir, relPaths);
  let copied = 0;
  let missing = 0;
  const missingList: string[] = [];
  stagedPaths.forEach((relPath) => {
    const src = path.join(sourceDir, relPath);
    const { prefix } = parseMetadataPath(relPath);
    let dest;
    if (prefix.length === 0) {
      dest = path.join(deployDir, 'force-app', 'main', 'default', relPath);
    } else {
      dest = path.join(deployDir, relPath);
    }

    if (!fs.existsSync(src)) {
      missing += 1;
      missingList.push(relPath);
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    if (shouldSanitize(relPath)) {
      const content = fs.readFileSync(src, 'utf8');
      const sanitized = sanitizeMetadataContent(relPath, content, sourceDir, destinationDir);
      fs.writeFileSync(dest, sanitized, 'utf8');
    } else {
      fs.copyFileSync(src, dest);
    }
    copied += 1;
  });
  return { copied, missing, missingList };
}

export function stageFullSource(sourceDir: string, deployDir: string) {
  let copied = 0;
  const ignoreList = new Set(['.git', '.sf', '.github', 'node_modules', '.next']);
  
  function copyRecursive(src: string, dest: string) {
    if (!fs.existsSync(src)) return;
    const stats = fs.statSync(src);
    const base = path.basename(src);
    if (ignoreList.has(base)) return;

    if (stats.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src);
      for (const entry of entries) {
        copyRecursive(path.join(src, entry), path.join(dest, entry));
      }
    } else if (stats.isFile()) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      copied++;
    }
  }

  copyRecursive(sourceDir, deployDir);
  return { copied };
}

export function stageManifestFiles(sourceDir: string, deployDir: string, manifestXml: string) {
  const components = parseManifestComponents(manifestXml);
  const relPaths: string[] = [];
  components.forEach(comp => {
    comp.members.forEach(member => {
      const resolved = resolveSourcePathsForComponent(comp.name, member);
      resolved.forEach(p => relPaths.push(p));
    });
  });
  return stageDeltaFiles(sourceDir, deployDir, relPaths);
}


function shouldSanitize(relPath: string): boolean {
  const { bundleType } = parseMetadataPath(relPath);
  if (bundleType === 'reports' || bundleType === 'dashboards' || relPath.includes('Folder')) {
    return true;
  }
  if (relPath.endsWith('.profile-meta.xml') || relPath.endsWith('.permissionset-meta.xml')) {
    return true;
  }
  if (relPath.endsWith('.workflow-meta.xml')) {
    return true;
  }
  if (relPath.endsWith('.field-meta.xml')) {
    return true;
  }
  if (relPath.endsWith('.layout-meta.xml')) {
    return true;
  }
  if (relPath.endsWith('.object-meta.xml')) {
    return true;
  }
  if (relPath.endsWith('.email')) {
    return true;
  }
  return false;
}

export function sanitizeMetadataContent(
  relPath: string,
  content: string,
  sourceDir: string,
  destinationDir?: string,
  logLines?: string[]
): string {
  let sanitized = content;
  const { bundleType, prefix, subParts } = parseMetadataPath(relPath);

  // 1. Report/Dashboard/Folder Healing
  if (bundleType === 'reports' || bundleType === 'dashboards' || relPath.includes('Folder')) {
    if (/<folderShares>/.test(sanitized)) {
      sanitized = sanitized.replace(/<folderShares>[\s\S]*?<\/folderShares>/g, () => {
        if (logLines) logLines.push(`HEALING: Normalizing folderShares for ${relPath}`);
        return `<folderShares>
        <accessLevel>View</accessLevel>
        <sharedTo>AllInternalUsers</sharedTo>
        <sharedToType>Group</sharedToType>
    </folderShares>`;
      });
    } else if (relPath.includes('Folder') || relPath.endsWith('Folder-meta.xml')) {
      if (logLines) logLines.push(`HEALING: Adding folderShares for ${relPath}`);
      const rootTag = relPath.endsWith('.reportFolder-meta.xml') ? 'ReportFolder' : (relPath.endsWith('.dashboardFolder-meta.xml') ? 'DashboardFolder' : 'Folder');
      const closeTag = `</${rootTag}>`;
      if (sanitized.includes(closeTag)) {
        sanitized = sanitized.replace(closeTag, `    <folderShares>
        <accessLevel>View</accessLevel>
        <sharedTo>AllInternalUsers</sharedTo>
        <sharedToType>Group</sharedToType>
    </folderShares>\n` + closeTag);
      }
    }

    if (bundleType === 'dashboards') {
      sanitized = sanitized.replace(/<runningUser>.*?<\/runningUser>/g, '');
    }

    sanitized = sanitized.replace(/<(?:owner|sharedBy)>.*?<\/(?:owner|sharedBy)>/g, '');
  }

  // 2. Profile / PermissionSet Healing
  if (relPath.endsWith('.profile-meta.xml') || relPath.endsWith('.permissionset-meta.xml')) {
    sanitized = sanitized.replace(/<fieldPermissions>[\s\S]*?<field>(.*?)<\/field>[\s\S]*?<\/fieldPermissions>/g, (match, fieldName) => {
       const objectName = fieldName.split('.')[0];
       const fieldPart = fieldName.split('.')[1];
       const fieldPath = `force-app/main/default/objects/${objectName}/fields/${fieldPart}.field-meta.xml`;
       
       if (destinationDir && !fs.existsSync(path.join(destinationDir, fieldPath)) && !fs.existsSync(path.join(sourceDir, fieldPath))) {
          if (logLines) logLines.push(`HEALING: Removing missing field permission ${fieldName} from ${relPath}`);
          return '';
       }
       return match;
     });

    sanitized = sanitized.replace(/<objectPermissions>[\s\S]*?<object>(.*?)<\/object>[\s\S]*?<\/objectPermissions>/g, (match, objectName) => {
       const objectPath = `force-app/main/default/objects/${objectName}`;
       if (destinationDir && !fs.existsSync(path.join(destinationDir, objectPath)) && !fs.existsSync(path.join(sourceDir, objectPath))) {
          if (logLines) logLines.push(`HEALING: Removing missing object permission ${objectName} from ${relPath}`);
          return '';
       }
       return match;
    });
  }

  // 3. Workflow Healing
  if (relPath.endsWith('.workflow-meta.xml')) {
     sanitized = sanitized.replace(/<recipients>[\s\S]*?<recipient>(.*?)<\/recipient>[\s\S]*?<type>user<\/type>[\s\S]*?<\/recipients>/g, (match, username) => {
        if (logLines) logLines.push(`HEALING: Removing user recipient ${username} from ${relPath}`);
        return '';
     });
  }

  // 4. Custom Field missing Global Value Set Healing
  if (relPath.endsWith('.field-meta.xml')) {
    const match = sanitized.match(/<(?:globalValueSet|valueSetName)>(.*?)<\/(?:globalValueSet|valueSetName)>/);
    if (match && match[1]) {
       const gvsName = match[1];
       const gvsPath = `force-app/main/default/globalValueSets/${gvsName}.globalValueSet-meta.xml`;
       if (!fs.existsSync(path.join(sourceDir, gvsPath)) && (destinationDir && !fs.existsSync(path.join(destinationDir, gvsPath)))) {
         if (logLines) logLines.push(`HEALING: Falling back to Text for missing GVS ${gvsName} in ${relPath}`);
         sanitized = sanitized.replace(/<valueSet>[\s\S]*?<\/valueSet>/g, '');
         sanitized = sanitized.replace(/<type>Picklist<\/type>/g, '<type>Text</type>\n    <length>255</length>');
         sanitized = sanitized.replace(/<type>MultiselectPicklist<\/type>/g, '<type>Text</type>\n    <length>255</length>');
       }
    }
  }

  // 5. Page Layout Related Solution List / SOLUTION.ISSUE Healing
  if (relPath.endsWith('.layout-meta.xml')) {
    sanitized = sanitized.replace(/<relatedLists>[\s\S]*?<relatedList>RelatedSolutionList<\/relatedList>[\s\S]*?<\/relatedLists>/g, '');
    sanitized = sanitized.replace(/<layoutItems>[\s\S]*?<field>SOLUTION.ISSUE<\/field>[\s\S]*?<\/layoutItems>/g, '');
  }

  // 6. Custom Object Action Overrides Healing
  if (relPath.endsWith('.object-meta.xml')) {
    if (logLines) logLines.push(`HEALING: Removing actionOverrides from ${relPath} to resolve FlexiPage reference issues`);
    sanitized = sanitized.replace(/<actionOverrides>[\s\S]*?<\/actionOverrides>/g, '');
  }

  // 7. Email Template Image src Healing
  if (relPath.endsWith('.email')) {
    if (logLines) logLines.push(`HEALING: Normalizing image src in email template ${relPath}`);
    sanitized = sanitized.replace(/src=(["'])\{\[devName:.*?\]\}\1/g, 'src="https://www.salesforce.com/favicon.ico"');
  }

  return sanitized;
}

export function expandStagePaths(sourceDir: string, relPaths: string[]) {
  const expanded = new Set<string>();

  relPaths.forEach((relPath) => {
    if (!relPath) return;
    expanded.add(relPath);

    const companion = relPath.endsWith('-meta.xml')
      ? relPath.slice(0, -'-meta.xml'.length)
      : `${relPath}-meta.xml`;
    if (companion && fs.existsSync(path.join(sourceDir, companion))) {
      expanded.add(companion);
    }

    const { prefix, bundleType, bundleName, subParts } = parseMetadataPath(relPath);
    if ((bundleType === 'lwc' || bundleType === 'aura') && bundleName) {
      const bundleDir = path.join(sourceDir, ...prefix, bundleType, bundleName);
      if (fs.existsSync(bundleDir) && fs.statSync(bundleDir).isDirectory()) {
        collectBundleFiles(sourceDir, bundleDir, expanded);
      }
    }

    if (bundleType === 'digitalExperiences' && subParts.length >= 3) {
      const space = subParts[1];
      const siteName = subParts[2];
      const bundleDir = path.join(sourceDir, ...prefix, 'digitalExperiences', space, siteName);
      if (fs.existsSync(bundleDir) && fs.statSync(bundleDir).isDirectory()) {
        collectBundleFiles(sourceDir, bundleDir, expanded);
      }
      const configMeta = path.join(...prefix, 'digitalExperienceConfigs', `${siteName}.digitalExperienceConfig-meta.xml`);
      if (fs.existsSync(path.join(sourceDir, configMeta))) {
        expanded.add(configMeta);
      }
    }

    if (bundleType === 'digitalExperienceConfigs' && bundleName) {
      const siteName = bundleName.replace(".digitalExperienceConfig-meta.xml", "");
      const bundleDir = path.join(sourceDir, ...prefix, 'digitalExperiences', 'site', siteName);
      if (fs.existsSync(bundleDir) && fs.statSync(bundleDir).isDirectory()) {
        collectBundleFiles(sourceDir, bundleDir, expanded);
      }
    }

    if (bundleType === 'experiences' && bundleName) {
      const bundleDir = path.join(sourceDir, ...prefix, bundleType, bundleName);
      if (fs.existsSync(bundleDir) && fs.statSync(bundleDir).isDirectory()) {
        collectBundleFiles(sourceDir, bundleDir, expanded);
      }
    }

    if (bundleType === 'staticresources' && bundleName) {
      const resourceName = bundleName.endsWith('.resource-meta.xml')
        ? bundleName.slice(0, -'.resource-meta.xml'.length)
        : bundleName.includes('.')
          ? bundleName.substring(0, bundleName.lastIndexOf('.'))
          : bundleName;
      const baseDir = path.join(...prefix, 'staticresources');
      const metaFile = path.join(baseDir, `${resourceName}.resource-meta.xml`);
      if (fs.existsSync(path.join(sourceDir, metaFile))) {
        expanded.add(metaFile);
      }
      const fullBaseDir = path.join(sourceDir, baseDir);
      if (fs.existsSync(fullBaseDir)) {
        try {
          const files = fs.readdirSync(fullBaseDir);
          for (const file of files) {
            if (file !== `${resourceName}.resource-meta.xml` && (file === resourceName || file.startsWith(`${resourceName}.`))) {
              const compRelPath = path.join(baseDir, file);
              const fullCompPath = path.join(sourceDir, compRelPath);
              if (fs.existsSync(fullCompPath)) {
                if (fs.statSync(fullCompPath).isDirectory()) {
                  collectBundleFiles(sourceDir, fullCompPath, expanded);
                } else {
                  expanded.add(compRelPath);
                }
              }
            }
          }
        } catch {}
      }
    }

    if (bundleType === 'objects' && bundleName && subParts.length > 2) {
       const objectMeta = path.join(...prefix, 'objects', bundleName, `${bundleName}.object-meta.xml`);
       if (fs.existsSync(path.join(sourceDir, objectMeta))) {
          expanded.add(objectMeta);
       }
    }

    if (bundleType === 'businessProcesses' && bundleName) {
       const caseStatusFile = path.join('force-app', 'main', 'default', 'standardValueSets', 'CaseStatus.standardValueSet-meta.xml');
       if (fs.existsSync(path.join(sourceDir, caseStatusFile))) {
          expanded.add(caseStatusFile);
       }
    }

    if ((bundleType === 'reports' || bundleType === 'dashboards' || bundleType === 'documents') && subParts.length > 2) {
       const folderName = subParts[1];
       const folderMeta = path.join(...prefix, bundleType, `${folderName}-meta.xml`);
       if (fs.existsSync(path.join(sourceDir, folderMeta))) {
          expanded.add(folderMeta);
       }
    }

    if (relPath.endsWith('.field-meta.xml')) {
       try {
         const content = fs.readFileSync(path.join(sourceDir, relPath), 'utf8');
         const match = content.match(/<(?:globalValueSet|valueSetName)>(.*?)<\/(?:globalValueSet|valueSetName)>/);
         if (match && match[1]) {
           const gvsPath = path.join(...prefix, 'globalValueSets', `${match[1]}.globalValueSet-meta.xml`);
           if (fs.existsSync(path.join(sourceDir, gvsPath))) {
             expanded.add(gvsPath);
           }
         }
       } catch (e) {}
    }
  });

  return Array.from(expanded);
}

function isEmptySharingRules(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return true;
  const content = fs.readFileSync(filePath, 'utf8');
  return !content.includes('<sharingCriteriaRules>') && 
         !content.includes('<sharingOwnerRules>') && 
         !content.includes('<sharingTerritoryRules>');
}

export function resolveSourcePathsForComponent(type: string, fullName: string): string[] {
  const paths: string[] = [];
  if (type === 'CustomField' && fullName.includes('.')) {
    const [obj, field] = fullName.split('.');
    paths.push(`force-app/main/default/objects/${obj}/fields/${field}.field-meta.xml`);
  } else if (type === 'RecordType' && fullName.includes('.')) {
    const [obj, rt] = fullName.split('.');
    paths.push(`force-app/main/default/objects/${obj}/recordTypes/${rt}.recordType-meta.xml`);
  } else if (type === 'BusinessProcess' && fullName.includes('.')) {
    const [obj, bp] = fullName.split('.');
    paths.push(`force-app/main/default/objects/${obj}/businessProcesses/${bp}.businessProcess-meta.xml`);
  } else if (type === 'CompactLayout' && fullName.includes('.')) {
    const [obj, cl] = fullName.split('.');
    paths.push(`force-app/main/default/objects/${obj}/compactLayouts/${cl}.compactLayout-meta.xml`);
  } else if (type === 'ValidationRule' && fullName.includes('.')) {
    const [obj, vr] = fullName.split('.');
    paths.push(`force-app/main/default/objects/${obj}/validationRules/${vr}.validationRule-meta.xml`);
  } else if (type === 'WebLink' && fullName.includes('.')) {
    const [obj, wl] = fullName.split('.');
    paths.push(`force-app/main/default/objects/${obj}/webLinks/${wl}.webLink-meta.xml`);
  } else if (type === 'ListView' && fullName.includes('.')) {
    const [obj, lv] = fullName.split('.');
    paths.push(`force-app/main/default/objects/${obj}/listViews/${lv}.listView-meta.xml`);
  } else if (type === 'FieldSet' && fullName.includes('.')) {
    const [obj, fset] = fullName.split('.');
    paths.push(`force-app/main/default/objects/${obj}/fieldSets/${fset}.fieldSet-meta.xml`);
  } else if (type === 'SharingReason' && fullName.includes('.')) {
    const [obj, sr] = fullName.split('.');
    paths.push(`force-app/main/default/objects/${obj}/sharingReasons/${sr}.sharingReason-meta.xml`);
  } else if (type === 'CustomObject') {
    paths.push(`force-app/main/default/objects/${fullName}/${fullName}.object-meta.xml`);
  } else if (type === 'QuickAction') {
    if (fullName.includes('.')) {
      const [obj, act] = fullName.split('.');
      paths.push(`force-app/main/default/objects/${obj}/quickActions/${act}.quickAction-meta.xml`);
    } else {
      paths.push(`force-app/main/default/quickActions/${fullName}.quickAction-meta.xml`);
    }
  } else if (type === 'GlobalValueSet') {
    paths.push(`force-app/main/default/globalValueSets/${fullName}.globalValueSet-meta.xml`);
  } else if (type === 'StandardValueSet') {
    paths.push(`force-app/main/default/standardValueSets/${fullName}.standardValueSet-meta.xml`);
  } else if (type === 'Report') {
    paths.push(`force-app/main/default/reports/${fullName}.report-meta.xml`);
  } else if (type === 'ReportType') {
    paths.push(`force-app/main/default/reportTypes/${fullName}.reportType-meta.xml`);
  } else if (type === 'Dashboard') {
    paths.push(`force-app/main/default/dashboards/${fullName}.dashboard-meta.xml`);
  } else if (type === 'ApexClass') {
    paths.push(`force-app/main/default/classes/${fullName}.cls`);
    paths.push(`force-app/main/default/classes/${fullName}.cls-meta.xml`);
  } else if (type === 'ApexTrigger') {
    paths.push(`force-app/main/default/triggers/${fullName}.trigger`);
    paths.push(`force-app/main/default/triggers/${fullName}.trigger-meta.xml`);
  } else if (type === 'ApexPage') {
    paths.push(`force-app/main/default/pages/${fullName}.page`);
    paths.push(`force-app/main/default/pages/${fullName}.page-meta.xml`);
  } else if (type === 'ApexComponent') {
    paths.push(`force-app/main/default/components/${fullName}.component`);
    paths.push(`force-app/main/default/components/${fullName}.component-meta.xml`);
  } else if (type === 'StaticResource') {
    paths.push(`force-app/main/default/staticresources/${fullName}.resource-meta.xml`);
  } else if (type === 'Flow') {
    paths.push(`force-app/main/default/flows/${fullName}.flow-meta.xml`);
  } else if (type === 'FlowDefinition') {
    paths.push(`force-app/main/default/flowDefinitions/${fullName}.flowDefinition-meta.xml`);
  } else if (type === 'Layout') {
    paths.push(`force-app/main/default/layouts/${fullName}.layout-meta.xml`);
  } else if (type === 'Workflow') {
    paths.push(`force-app/main/default/workflows/${fullName}.workflow-meta.xml`);
  } else if (type === 'SharingRules') {
    paths.push(`force-app/main/default/sharingRules/${fullName}.sharingRules-meta.xml`);
  } else if (type === 'PermissionSet') {
    paths.push(`force-app/main/default/permissionsets/${fullName}.permissionset-meta.xml`);
  } else if (type === 'PermissionSetGroup') {
    paths.push(`force-app/main/default/permissionsetgroups/${fullName}.permissionsetgroup-meta.xml`);
  } else if (type === 'Profile') {
    paths.push(`force-app/main/default/profiles/${fullName}.profile-meta.xml`);
  } else if (type === 'LightningComponentBundle') {
    paths.push(`force-app/main/default/lwc/${fullName}`);
  } else if (type === 'AuraDefinitionBundle') {
    paths.push(`force-app/main/default/aura/${fullName}`);
  } else if (type === 'CustomLabels') {
    paths.push('force-app/main/default/labels/CustomLabels.labels-meta.xml');
  } else if (type === 'CustomMetadata') {
    paths.push(`force-app/main/default/customMetadata/${fullName}.md-meta.xml`);
  } else if (type === 'FlexiPage') {
    paths.push(`force-app/main/default/flexipages/${fullName}.flexipage-meta.xml`);
  } else if (type === 'CustomTab') {
    paths.push(`force-app/main/default/tabs/${fullName}.tab-meta.xml`);
  } else if (type === 'CustomApplication') {
    paths.push(`force-app/main/default/applications/${fullName}.app-meta.xml`);
  } else if (type === 'CustomPermission') {
    paths.push(`force-app/main/default/customPermissions/${fullName}.customPermission-meta.xml`);
  } else if (type === 'ConnectedApp') {
    paths.push(`force-app/main/default/connectedApps/${fullName}.connectedApp-meta.xml`);
  } else if (type === 'ExternalClientApplication') {
    paths.push(`force-app/main/default/externalClientApps/${fullName}.eca-meta.xml`);
  } else if (type === 'DuplicateRule') {
    paths.push(`force-app/main/default/duplicateRules/${fullName}.duplicateRule-meta.xml`);
  } else if (type === 'MatchingRules') {
    paths.push(`force-app/main/default/matchingRules/${fullName}.matchingRule-meta.xml`);
  } else if (type === 'RemoteSiteSetting') {
    paths.push(`force-app/main/default/remoteSiteSettings/${fullName}.remoteSite-meta.xml`);
  } else if (type === 'CspTrustedSite') {
    paths.push(`force-app/main/default/cspTrustedSites/${fullName}.cspTrustedSite-meta.xml`);
  } else if (type === 'Certificate') {
    paths.push(`force-app/main/default/certs/${fullName}.crt`);
    paths.push(`force-app/main/default/certs/${fullName}.crt-meta.xml`);
  } else if (type === 'Document') {
    paths.push(`force-app/main/default/documents/${fullName}`);
    paths.push(`force-app/main/default/documents/${fullName}-meta.xml`);
  } else if (type === 'EmailTemplate') {
    paths.push(`force-app/main/default/email/${fullName}.email`);
    paths.push(`force-app/main/default/email/${fullName}.email-meta.xml`);
  } else if (type === 'EmailServicesFunction') {
    paths.push(`force-app/main/default/emailservices/${fullName}.xml`);
  } else if (type === 'ContentAsset') {
    paths.push(`force-app/main/default/contentassets/${fullName}.asset-meta.xml`);
  } else if (type === 'Network') {
    paths.push(`force-app/main/default/networks/${fullName}.network-meta.xml`);
  } else if (type === 'NetworkBranding') {
    paths.push(`force-app/main/default/networkBranding/${fullName}.networkBranding-meta.xml`);
  } else if (type === 'NavigationMenu') {
    paths.push(`force-app/main/default/navigationMenus/${fullName}.navigationMenu-meta.xml`);
  } else if (type === 'ExperienceBundle') {
    paths.push(`force-app/main/default/experiences/${fullName}`);
  } else if (type === 'DigitalExperienceBundle') {
    if (fullName.includes("/")) {
      paths.push(`force-app/main/default/digitalExperiences/${fullName}`);
    } else {
      paths.push(`force-app/main/default/digitalExperiences/site/${fullName}`);
    }
  } else if (type === 'DigitalExperienceConfig') {
    paths.push(`force-app/main/default/digitalExperienceConfigs/${fullName}.digitalExperienceConfig-meta.xml`);
  } else if (type === 'AppMenu') {
    paths.push(`force-app/main/default/appMenus/${fullName}.appMenu-meta.xml`);
  } else if (type === 'CallCenter') {
    paths.push(`force-app/main/default/callCenters/${fullName}.callCenter-meta.xml`);
  } else if (type === 'CleanDataService') {
    paths.push(`force-app/main/default/cleanDataServices/${fullName}.cleanDataService-meta.xml`);
  } else if (type === 'Audience') {
    paths.push(`force-app/main/default/audience/${fullName}.audience-meta.xml`);
  } else if (type === 'PathAssistant') {
    paths.push(`force-app/main/default/pathAssistants/${fullName}.pathAssistant-meta.xml`);
  } else if (type === 'UserCriteria') {
    paths.push(`force-app/main/default/userCriteria/${fullName}.userCriteria-meta.xml`);
  } else if (type === 'SamlSsoConfig') {
    paths.push(`force-app/main/default/samlssoconfigs/${fullName}.samlSsoConfig-meta.xml`);
  } else if (type.endsWith('Settings') || type === 'Settings') {
    const baseName = fullName.replace(/Settings$/, '');
    paths.push(`force-app/main/default/settings/${baseName}.settings-meta.xml`);
    paths.push(`force-app/main/default/settings/${fullName}.settings-meta.xml`);
  } else {
    const folder = type.charAt(0).toLowerCase() + type.slice(1);
    paths.push(`force-app/main/default/${folder}/${fullName}.${folder}-meta.xml`);
    paths.push(`force-app/main/default/${folder}/${fullName}`);
  }
  return paths;
}

export function extractMissingDependencies(failures: any[], sourceDir: string): { type: string, fullName: string }[] {
  const missing: { type: string, fullName: string }[] = [];
  const added = new Set<string>();

  const addUnique = (type: string, fullName: string) => {
    const cleanType = String(type || '').trim();
    const cleanName = String(fullName || '').trim();
    if (!cleanType || !cleanName) return;
    const key = `${cleanType}:${cleanName}`;
    if (!added.has(key)) {
      added.add(key);
      missing.push({ type: cleanType, fullName: cleanName });
    }
  };

  failures.forEach(f => {
    const errorMsg = f.problem || f.error || f.problemType || '';
    
    // 1. Universal "no <Type> named <Name> found" pattern
    const universalMatch = errorMsg.match(/no ([a-zA-Z0-9_]+) named ([a-zA-Z0-9_.-]+) found/i);
    if (universalMatch) {
      addUnique(universalMatch[1], universalMatch[2]);
    }

    // 2. "In field: ... - no <Type> named <Name> found"
    const inFieldMatch = errorMsg.match(/In field:\s*[a-zA-Z0-9_.]+\s*-\s*no\s+([a-zA-Z0-9_]+)\s+named\s+([a-zA-Z0-9_.-]+)\s+found/i);
    if (inFieldMatch) {
      addUnique(inFieldMatch[1], inFieldMatch[2]);
    }

    // 3. Schema.Object or Schema.Object.Field
    const peMatch = errorMsg.match(/Invalid type:\s*Schema\.([a-zA-Z0-9_]+)/i);
    if (peMatch) {
      addUnique('CustomObject', peMatch[1]);
    }

    // 4. Apex Type is not visible / invalid type (Apex class or trigger dependency)
    const apexTypeMatch = errorMsg.match(/(?:Type is not visible|Invalid type):\s*([a-zA-Z0-9_]+)/i);
    if (apexTypeMatch && apexTypeMatch[1] && !apexTypeMatch[1].startsWith('Schema')) {
      addUnique('ApexClass', apexTypeMatch[1]);
    }

    // 5. Dependent class is invalid and needs recompilation: <ClassName>
    const depClassMatch = errorMsg.match(/Dependent class is invalid and needs recompilation:\s*([a-zA-Z0-9_]+)/i);
    if (depClassMatch) {
      addUnique('ApexClass', depClassMatch[1]);
    }

    // 6. CustomLabels (Variable does not exist: Label.<Name>)
    const labelMatch = errorMsg.match(/Variable does not exist:\s*Label\.([a-zA-Z0-9_]+)/i);
    if (labelMatch) {
      addUnique('CustomLabels', 'CustomLabels');
    }

    // 7. Missing parent CustomObject: Cannot find CustomObject <Name> / Parent object '<Name>' not found
    const parentObjMatch = errorMsg.match(/(?:Cannot find CustomObject|Parent object|Cannot find parent object)\s*['"]?([a-zA-Z0-9_]+)['"]?\s*(?:not found)?/i);
    if (parentObjMatch) {
      addUnique('CustomObject', parentObjMatch[1]);
    }

    // 8. Field does not exist: <Field> on <Object> / No such column '<Field>' on entity '<Object>'
    const fieldOnObjMatch = errorMsg.match(/(?:Field does not exist:\s*([a-zA-Z0-9_]+)\s*on\s*([a-zA-Z0-9_]+)|No such column\s*'([a-zA-Z0-9_]+)'\s*on entity\s*'([a-zA-Z0-9_]+)')/i);
    if (fieldOnObjMatch) {
      const field = fieldOnObjMatch[1] || fieldOnObjMatch[3];
      const obj = fieldOnObjMatch[2] || fieldOnObjMatch[4];
      addUnique('CustomField', `${obj}.${field}`);
    }

    // 9. Flow start element object
    if (errorMsg.includes('find the object specified in the Start element') && f.filePath) {
      try {
        const flowXml = fs.readFileSync(f.filePath, 'utf8');
        const flowObjMatch = flowXml.match(/<object>([a-zA-Z0-9_]+)<\/object>/);
        if (flowObjMatch) {
          addUnique('CustomObject', flowObjMatch[1]);
        }
      } catch (err) {}
    }

    // 10. Missing Subflow (The Flow named <Name> could not be found)
    const subflowMatch = errorMsg.match(/(?:The Flow named|subflow named)\s*['"]?([a-zA-Z0-9_]+)['"]?\s*could not be found/i);
    if (subflowMatch) {
      addUnique('Flow', subflowMatch[1]);
    }

    // 11. Missing Component [c:<Name>] (LWC or Aura)
    const compMatch = errorMsg.match(/(?:Component|Failed to resolve component)\s*\[c:([a-zA-Z0-9_]+)\]/i);
    if (compMatch) {
      addUnique('LightningComponentBundle', compMatch[1]);
    }

    // 12. Static resource named <Name> does not exist
    const srMatch = errorMsg.match(/Static resource named\s*([a-zA-Z0-9_]+)\s*does not exist/i);
    if (srMatch) {
      addUnique('StaticResource', srMatch[1]);
    }

    // 13. GlobalValueSet named <Name> does not exist
    const gvsMatch = errorMsg.match(/(?:GlobalValueSet named|Global Value Set)\s*([a-zA-Z0-9_]+)/i);
    if (gvsMatch) {
      addUnique('GlobalValueSet', gvsMatch[1]);
    }
  });

  return missing;
}

function filterAndAppendManifest(
  manifestPath: string,
  excludedComponents: string[],
  addedComponents: string[],
  outputPath: string
) {
  const typeMap = parseManifestTypes(manifestPath);
  const excluded = new Set(excludedComponents);
  
  const filtered = typeMap
    .map((type) => {
      const members = type.members.filter((member) => !excluded.has(`${type.name}:${member}`));
      return { name: type.name, members };
    })
    .filter((type) => type.members.length > 0);
    
  addedComponents.forEach((compStr) => {
    const [name, member] = compStr.split(':');
    if (!name || !member) return;
    const existing = filtered.find(t => t.name === name);
    if (existing) {
      if (!existing.members.includes(member)) {
        existing.members.push(member);
      }
    } else {
      filtered.push({ name, members: [member] });
    }
  });
  
  const xml = buildPackageXml(filtered);
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, xml, 'utf8');
  return outputPath;
}


/**
 * Automatically enriches a manifest containing Profile or CustomApplication to preserve
 * Field-Level Security (FLS), Layout Assignments, and Action Overrides parity.
 */
export function enrichManifestForParity(
  manifestTypes: { name: string; members: string[] }[],
  availableObjects: string[] = [],
  availableLayouts: string[] = []
): { name: string; members: string[] }[] {
  const hasProfile = manifestTypes.some((t) => t.name === 'Profile');
  if (!hasProfile) return manifestTypes;

  const enriched = [...manifestTypes];
  
  if (!enriched.some((t) => t.name === 'Layout') && availableLayouts.length > 0) {
    enriched.push({ name: 'Layout', members: availableLayouts });
  }

  if (!enriched.some((t) => t.name === 'CustomObject') && availableObjects.length > 0) {
    enriched.push({ name: 'CustomObject', members: availableObjects });
  }

  return enriched;
}

/**
 * Automatically sanitizes staged deployment metadata files to prevent common
 * Salesforce Metadata API rejections (e.g., folderShares referencing missing sandbox users,
 * invalid runningUser sandbox suffixes in dashboards).
 */
export function sanitizeStagedDeploymentFiles(targetDir: string, fallbackRunningUser?: string): number {
  if (!fs.existsSync(targetDir)) return 0;
  let sanitizedCount = 0;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (
          entry.name.endsWith('.dashboardFolder-meta.xml') ||
          entry.name.endsWith('.emailFolder-meta.xml') ||
          entry.name.endsWith('.reportFolder-meta.xml')
        ) {
          const original = fs.readFileSync(fullPath, 'utf8');
          const sanitized = sanitizeFolderShares(original);
          if (sanitized !== original) {
            fs.writeFileSync(fullPath, sanitized, 'utf8');
            sanitizedCount++;
          }
        } else if (entry.name.endsWith('.dashboard-meta.xml')) {
          const original = fs.readFileSync(fullPath, 'utf8');
          const sanitized = sanitizeDashboardMetadata(original, fallbackRunningUser);
          if (sanitized !== original) {
            fs.writeFileSync(fullPath, sanitized, 'utf8');
            sanitizedCount++;
          }
        }
      }
    }
  }

  walk(targetDir);
  return sanitizedCount;
}
