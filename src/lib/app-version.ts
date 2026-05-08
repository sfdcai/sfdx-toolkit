import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type AppVersionInfo = {
  version: string;
  hash: string;
  baseVersion: string;
  sourceCount: number;
  buildTimestamp: string;
};

const ROOT = process.cwd();
const VERSION_SOURCES = ['src', 'scripts', 'package.json', 'next.config.js'];

let cached: AppVersionInfo | null = null;

function walkFiles(relPath: string): string[] {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) return [];
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) return [relPath];
  if (!stat.isDirectory()) return [];
  return fs
    .readdirSync(fullPath, { withFileTypes: true })
    .flatMap((entry) => walkFiles(path.join(relPath, entry.name)))
    .sort();
}

function loadBaseVersion() {
  const packageJsonPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return String(pkg.version || '0.0.0');
}

function loadBuildTimestamp() {
  const buildIdPath = path.join(ROOT, '.next', 'BUILD_ID');
  if (fs.existsSync(buildIdPath)) {
    return fs.statSync(buildIdPath).mtime.toISOString();
  }
  return new Date().toISOString();
}

export function getAppVersionInfo(): AppVersionInfo {
  if (cached) return cached;
  const files = VERSION_SOURCES.flatMap((item) => walkFiles(item)).sort();
  const hash = crypto.createHash('sha256');
  hash.update(loadBaseVersion());
  files.forEach((relPath) => {
    const fullPath = path.join(ROOT, relPath);
    hash.update(relPath);
    hash.update('\n');
    hash.update(fs.readFileSync(fullPath));
    hash.update('\n');
  });
  const digest = hash.digest('hex').slice(0, 10);
  const baseVersion = loadBaseVersion();
  const buildTimestamp = loadBuildTimestamp();
  cached = {
    version: `${baseVersion}+${digest} @ ${buildTimestamp}`,
    hash: digest,
    baseVersion,
    sourceCount: files.length,
    buildTimestamp
  };
  return cached;
}
