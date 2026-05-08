import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'node:child_process';
import { buildPackageXml, parseManifestComponents } from './metadata';
import { getSfCommand, getSfEnv } from './sf';

type DeployArgs = {
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
};

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
    .map((item) => {
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
  } catch {
    return { supportedTypes: null as Set<string> | null, registryPath };
  }
}

export function filterUnsupportedMetadataTypes(
  manifestTypes: { name: string; members: string[] }[],
  supportedTypes: Set<string> | null
) {
  if (!supportedTypes) {
    return {
      filteredTypes: manifestTypes,
      skippedTypes: [] as string[]
    };
  }

  const filteredTypes: { name: string; members: string[] }[] = [];
  const skippedTypes: string[] = [];
  manifestTypes.forEach((type) => {
    const parentType = DECOMPOSED_CHILD_TYPE_PARENTS[type.name];
    if (supportedTypes.has(type.name) || (parentType && supportedTypes.has(parentType))) {
      filteredTypes.push(type);
    } else {
      skippedTypes.push(type.name);
    }
  });

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
  if (!previousFailedComponents.length) return true;
  const current = [...new Set(failedComponents)].sort();
  const previous = [...new Set(previousFailedComponents)].sort();
  return current.join('\n') !== previous.join('\n');
}

function writeFilteredManifest(outputPath: string, types: { name: string; members: string[] }[]) {
  const xml = buildPackageXml(types);
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, xml, 'utf8');
  return outputPath;
}

function runDeployCommand(command: string, cwd: string) {
  const stdout = execSync(`bash -lc \"${command}\"`, { encoding: 'utf8', cwd, env: getSfEnv() });
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
  selectionPaths = []
}: DeployArgs) {
  ensureDir(deployLogPath);
  const logLines: string[] = [];
  if (sourcePath && selectionPaths.length) {
    const staged = stageDeltaFiles(sourcePath, projectPath, selectionPaths);
    logLines.push(`STAGED: ${staged.copied} copied, ${staged.missing} missing`);
    if (staged.missingList.length) {
      logLines.push(`MISSING: ${staged.missingList.join(', ')}`);
    }
  }
  const versionArg = apiVersion ? ` --api-version ${apiVersion}` : '';
  let activeManifest = manifestPath;
  if (components.length) {
    const types = components.map((entry) => {
      const [name, member] = entry.split(':');
      return { name, members: [member || '*'] };
    });
    activeManifest = path.join(path.dirname(manifestPath), 'component-override.xml');
    const xml = buildPackageXml(types);
    fs.writeFileSync(activeManifest, xml, 'utf8');
  }
  const testArgs = testLevel ? ` --test-level ${testLevel}` : '';
  const testsArg = runTests.length ? ` --tests \"${runTests.join(',')}\"` : '';
  const dryRunArg = checkOnly ? ' --dry-run' : '';
  const destructivePath = path.join(projectPath, 'manifest', 'destructiveChanges.xml');
  const { supportedTypes, registryPath } = loadSupportedMetadataTypes();
  const manifestTypes = parseManifestTypes(activeManifest);
  const filteredManifest = filterUnsupportedMetadataTypes(manifestTypes, supportedTypes);
  const skippedMetadataTypes = new Set<string>(filteredManifest.skippedTypes);
  if (filteredManifest.skippedTypes.length) {
    activeManifest = path.join(path.dirname(manifestPath), 'filtered-package.xml');
    writeFilteredManifest(activeManifest, filteredManifest.filteredTypes);
    logLines.push(`SKIPPED TYPES: ${filteredManifest.skippedTypes.join(', ')}`);
  }

  let destructiveArg = '';
  if (fs.existsSync(destructivePath)) {
    const destructiveTypes = parseManifestTypes(destructivePath);
    const filteredDestructive = filterUnsupportedMetadataTypes(destructiveTypes, supportedTypes);
    filteredDestructive.skippedTypes.forEach((type) => skippedMetadataTypes.add(type));
    if (filteredDestructive.filteredTypes.length) {
      const activeDestructivePath = filteredDestructive.skippedTypes.length
        ? path.join(projectPath, 'manifest', 'filtered-destructiveChanges.xml')
        : destructivePath;
      if (filteredDestructive.skippedTypes.length) {
        writeFilteredManifest(activeDestructivePath, filteredDestructive.filteredTypes);
      }
      destructiveArg = ` --post-destructive-changes \"${activeDestructivePath}\"`;
    }
  }
  const unsupportedMetadataTypes = Array.from(skippedMetadataTypes).sort();
  const unsupportedSummary =
    unsupportedMetadataTypes.length > 0
      ? {
          unsupportedMetadataTypes,
          warning: `Skipped unsupported metadata types from deploy manifest: ${unsupportedMetadataTypes.join(', ')}`,
          registryPath
        }
      : {};

  if (!filteredManifest.filteredTypes.length) {
    const result = {
      error: 'No deployable metadata types remained after filtering unsupported metadata types.',
      ...unsupportedSummary
    };
    logLines.push(`ERROR: ${JSON.stringify(result, null, 2)}`);
    fs.writeFileSync(deployLogPath, logLines.join('\n'), 'utf8');
    return {
      status: 'Failed',
      attempts: 1,
      failedComponents: [],
      manifestPath: activeManifest,
      deployLogPath,
      output: result
    };
  }
  const sfCommand = getSfCommand();
  let currentManifest = activeManifest;
  let currentDestructiveArg = destructiveArg;
  let result: Record<string, unknown> | string | null = null;
  let status = 'Failed';
  let failedComponents: string[] = [];
  let attempts = 1;
  let registryFiltered = false;

  while (true) {
    const command = `${sfCommand} project deploy start --manifest \"${currentManifest}\" --target-org \"${targetOrg}\"${testArgs}${testsArg}${dryRunArg}${currentDestructiveArg}${versionArg} --json`;
    try {
      const run = runDeployCommand(command, projectPath);
      result = {
        ...((run.parsed as Record<string, unknown>) || { raw: run.raw }),
        ...unsupportedSummary
      };
      failedComponents = extractFailures(run.parsed as Record<string, any>);
      status = (run.parsed as Record<string, any>)?.status === 0 ? 'Succeeded' : 'Failed';
      logLines.push(`COMMAND: ${command}`);
      logLines.push(`OUTPUT: ${JSON.stringify(result, null, 2)}`);
      break;
    } catch (err) {
      const stdout = err instanceof Error && (err as Error & { stdout?: string }).stdout ? String((err as Error & { stdout?: string }).stdout) : '';
      const stderr = err instanceof Error && (err as Error & { stderr?: string }).stderr ? String((err as Error & { stderr?: string }).stderr) : (err as Error).message;
      const parsed = parseSfJson(stdout);
      const errorPayload = parsed || { error: stderr.trim() };
      const missingRegistryType = parseMissingRegistryType(errorPayload);
      logLines.push(`COMMAND: ${command}`);
      logLines.push(`ERROR: ${JSON.stringify({ ...errorPayload, ...unsupportedSummary }, null, 2)}`);

      if (missingRegistryType && !registryFiltered) {
        registryFiltered = true;
        skippedMetadataTypes.add(missingRegistryType);
        const filteredManifestPath = path.join(path.dirname(manifestPath), 'registry-filtered-package.xml');
        const manifestFilter = filterManifestTypes(currentManifest, [missingRegistryType], filteredManifestPath);
        currentManifest = manifestFilter.outputPath;
        if (!manifestFilter.remainingTypes.length) {
          result = {
            error: `No deployable metadata types remained after removing registry-unsupported type ${missingRegistryType}.`,
            unsupportedMetadataTypes: Array.from(skippedMetadataTypes).sort(),
            registryPath
          };
          status = 'Failed';
          break;
        }

        if (fs.existsSync(destructivePath)) {
          const filteredDestructivePath = path.join(projectPath, 'manifest', 'registry-filtered-destructiveChanges.xml');
          const destructiveFilter = filterManifestTypes(destructivePath, [missingRegistryType], filteredDestructivePath);
          currentDestructiveArg = destructiveFilter.remainingTypes.length
            ? ` --post-destructive-changes \"${filteredDestructivePath}\"`
            : '';
        }

        logLines.push(`REGISTRY SKIP: ${missingRegistryType}`);
        continue;
      }

      result = {
        ...errorPayload,
        unsupportedMetadataTypes: Array.from(skippedMetadataTypes).sort(),
        ...(unsupportedMetadataTypes.length > 0 ? { warning: `Skipped unsupported metadata types from deploy manifest: ${Array.from(skippedMetadataTypes).sort().join(', ')}` } : {}),
        registryPath
      };
      failedComponents = extractFailures(parsed as Record<string, any>);
      status = 'Failed';
      break;
    }
  }

  if (status !== 'Succeeded') {
    let previousFailedComponents: string[] = [];
    const retryResults: Record<string, unknown>[] = [];
    while (shouldContinueAutoRetry(autoRetry, attempts, failedComponents, previousFailedComponents, retryLimit)) {
      previousFailedComponents = [...failedComponents];
      attempts += 1;
      const retryManifest = path.join(path.dirname(manifestPath), `auto-retry-package-${attempts}.xml`);
      filterManifest(currentManifest, failedComponents, retryManifest);
      currentManifest = retryManifest;
      const retryCommand = `${sfCommand} project deploy start --manifest \"${retryManifest}\" --target-org \"${targetOrg}\"${testArgs}${testsArg}${dryRunArg}${currentDestructiveArg}${versionArg} --json`;
      try {
        const retryRun = runDeployCommand(retryCommand, projectPath);
        const retryResult = (retryRun.parsed as Record<string, unknown>) || { raw: retryRun.raw };
        logLines.push(`RETRY COMMAND ${attempts}: ${retryCommand}`);
        logLines.push(`RETRY OUTPUT ${attempts}: ${JSON.stringify({ ...retryResult, ...unsupportedSummary }, null, 2)}`);
        retryResults.push(retryResult);
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
        logLines.push(`RETRY COMMAND ${attempts}: ${retryCommand}`);
        logLines.push(`RETRY ERROR ${attempts}: ${JSON.stringify({ ...retryPayload, ...unsupportedSummary }, null, 2)}`);
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

function stageDeltaFiles(sourceDir: string, deployDir: string, relPaths: string[]) {
  const stagedPaths = expandStagePaths(sourceDir, relPaths);
  let copied = 0;
  let missing = 0;
  const missingList: string[] = [];
  stagedPaths.forEach((relPath) => {
    const src = path.join(sourceDir, relPath);
    const dest = path.join(deployDir, relPath);
    if (!fs.existsSync(src)) {
      missing += 1;
      missingList.push(relPath);
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copied += 1;
  });
  return { copied, missing, missingList };
}

function expandStagePaths(sourceDir: string, relPaths: string[]) {
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

    const parts = relPath.split(path.sep).filter(Boolean);
    const bundleType = parts[0];
    if ((bundleType === 'lwc' || bundleType === 'aura') && parts[1]) {
      const bundleDir = path.join(sourceDir, bundleType, parts[1]);
      if (fs.existsSync(bundleDir) && fs.statSync(bundleDir).isDirectory()) {
        collectBundleFiles(sourceDir, bundleDir, expanded);
      }
    }
  });

  return Array.from(expanded);
}

function collectBundleFiles(sourceDir: string, bundleDir: string, expanded: Set<string>) {
  const entries = fs.readdirSync(bundleDir, { withFileTypes: true });
  entries.forEach((entry) => {
    const fullPath = path.join(bundleDir, entry.name);
    if (entry.isDirectory()) {
      collectBundleFiles(sourceDir, fullPath, expanded);
      return;
    }
    expanded.add(path.relative(sourceDir, fullPath));
  });
}
