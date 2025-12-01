import fs from 'fs';
import path from 'path';

function ensureDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

export function parseManifestComponents(manifestPath) {
  if (!fs.existsSync(manifestPath)) return [];
  const xml = fs.readFileSync(manifestPath, 'utf8');
  const matches = [...xml.matchAll(/<members>(.*?)<\/members>/g)].map((m) => m[1]);
  return matches.length ? matches : ['delta-package'];
}

export function simulateDeploy({
  projectPath,
  deployLogPath,
  manifestPath,
  testLevel = 'NoTestRun',
  runTests = [],
  checkOnly = false,
  autoRetry = true,
  components = []
}) {
  ensureDir(deployLogPath);
  const parts = [];
  const manifestComponents = components.length ? components : parseManifestComponents(manifestPath);
  const failingComponents = manifestComponents.filter((c) => c.toLowerCase().includes('fail'));

  parts.push(`Deploy requested at ${new Date().toISOString()}`);
  parts.push(`Manifest: ${manifestPath || 'not provided'}`);
  parts.push(`TestLevel: ${testLevel}${runTests.length ? ` (${runTests.join(',')})` : ''}`);
  parts.push(`CheckOnly: ${checkOnly}`);
  parts.push(`Components: ${manifestComponents.join(', ')}`);

  let status = 'Succeeded';
  let attempts = 1;
  if (failingComponents.length) {
    status = 'Failed';
    parts.push(`Failed components: ${failingComponents.join(', ')}`);
    if (autoRetry) {
      attempts += 1;
      status = 'SucceededWithRetry';
      const retried = manifestComponents.filter((c) => !failingComponents.includes(c));
      parts.push('Auto-retry enabled: retrying without failing components...');
      parts.push(`Retry components: ${retried.join(', ')}`);
    }
  }

  fs.writeFileSync(deployLogPath, parts.join('\n'), 'utf8');
  return { status, attempts, failedComponents: failingComponents, manifestComponents, deployLogPath, projectPath };
}
