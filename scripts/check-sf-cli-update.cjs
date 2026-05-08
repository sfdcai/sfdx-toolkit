#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const STATUS_FILE = path.join(ROOT, 'docs', 'sf-cli-status.md');
const HISTORY_FILE = path.join(ROOT, 'docs', 'sf-cli-update-history.md');
const HISTORY_JSON_FILE = path.join(ROOT, 'data', 'sf-cli-update-history.json');

function parseArgs(argv) {
  const args = {
    checkOnly: false,
    currentVersion: '',
    latestVersion: '',
    sfBin: process.env.SF_BIN || '/root/cli/sf/bin/sf',
    npmBin: process.env.NPM_BIN || 'npm',
    updateCommand: process.env.SF_UPDATE_COMMAND || '',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--check-only') {
      args.checkOnly = true;
      continue;
    }
    if (token === '--sf-bin' && argv[i + 1]) {
      args.sfBin = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--current-version' && argv[i + 1]) {
      args.currentVersion = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--latest-version' && argv[i + 1]) {
      args.latestVersion = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--update-command' && argv[i + 1]) {
      args.updateCommand = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function parseSfVersion(raw) {
  const match = String(raw).match(/@salesforce\/cli\/(\d+\.\d+\.\d+)/);
  if (match) return match[1];
  const simple = String(raw).match(/\b(\d+\.\d+\.\d+)\b/);
  return simple ? simple[1] : '';
}

function normalizeVersion(version) {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .replace(/^"+|"+$/g, '');
}

function compareSemver(a, b) {
  const left = normalizeVersion(a).split('.').map((item) => Number.parseInt(item, 10) || 0);
  const right = normalizeVersion(b).split('.').map((item) => Number.parseInt(item, 10) || 0);
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_JSON_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  ensureDir(HISTORY_JSON_FILE);
  fs.writeFileSync(HISTORY_JSON_FILE, JSON.stringify(entries, null, 2));
}

function writeStatusMd(result) {
  const lines = [
    '# SF CLI Status',
    '',
    `- Last checked: ${result.checkedAt}`,
    `- Current installed version: ${result.currentVersion || 'unknown'}`,
    `- Latest published version: ${result.latestVersion || 'unknown'}`,
    `- Update attempted: ${result.updateAttempted ? 'yes' : 'no'}`,
    `- Update applied: ${result.updateApplied ? 'yes' : 'no'}`,
    `- Check-only mode: ${result.checkOnly ? 'yes' : 'no'}`,
    `- SF binary: \`${result.sfBin}\``,
    '',
    '## Outcome',
    '',
    result.message,
    '',
  ];

  if (result.error) {
    lines.push('## Error', '', '```text', result.error, '```', '');
  }

  ensureDir(STATUS_FILE);
  fs.writeFileSync(STATUS_FILE, `${lines.join('\n')}\n`);
}

function writeHistoryMd(entries) {
  const lines = [
    '# SF CLI Update History',
    '',
    '| Checked At (UTC) | Installed | Latest | Attempted | Applied | Result |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  entries
    .slice()
    .reverse()
    .forEach((entry) => {
      lines.push(
        `| ${entry.checkedAt} | ${entry.currentVersion || 'unknown'} | ${entry.latestVersion || 'unknown'} | ${entry.updateAttempted ? 'yes' : 'no'} | ${entry.updateApplied ? 'yes' : 'no'} | ${entry.message.replace(/\|/g, '\\|')} |`
      );
    });

  ensureDir(HISTORY_FILE);
  fs.writeFileSync(HISTORY_FILE, `${lines.join('\n')}\n`);
}

function detectCurrentVersion(args) {
  if (args.currentVersion) return normalizeVersion(args.currentVersion);
  const output = run(args.sfBin, ['--version']);
  const version = parseSfVersion(output);
  if (!version) throw new Error(`Unable to parse current SF CLI version from: ${output}`);
  return version;
}

function detectLatestVersion(args) {
  if (args.latestVersion) return normalizeVersion(args.latestVersion);
  const output = run(args.npmBin, ['view', '@salesforce/cli', 'version', '--json']);
  const parsed = JSON.parse(output);
  const version = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
  if (!version) throw new Error(`Unable to resolve latest @salesforce/cli version from: ${output}`);
  return normalizeVersion(version);
}

function runUpdate(args) {
  if (args.updateCommand) {
    return run('/bin/bash', ['-lc', args.updateCommand]);
  }
  return run(args.sfBin, ['update']);
}

function main() {
  const args = parseArgs(process.argv);
  const checkedAt = new Date().toISOString();
  const result = {
    checkedAt,
    currentVersion: '',
    latestVersion: '',
    updateAttempted: false,
    updateApplied: false,
    checkOnly: args.checkOnly,
    sfBin: args.sfBin,
    message: '',
    error: '',
  };

  try {
    result.currentVersion = detectCurrentVersion(args);
    result.latestVersion = detectLatestVersion(args);

    const needsUpdate = compareSemver(result.latestVersion, result.currentVersion) > 0;
    if (!needsUpdate) {
      result.message = `SF CLI is already current at ${result.currentVersion}.`;
    } else if (args.checkOnly) {
      result.message = `Update available: ${result.currentVersion} -> ${result.latestVersion}.`;
    } else {
      result.updateAttempted = true;
      runUpdate(args);
      const updatedVersion = detectCurrentVersion(args);
      result.currentVersion = updatedVersion;
      result.updateApplied = compareSemver(updatedVersion, result.latestVersion) >= 0;
      result.message = result.updateApplied
        ? `SF CLI updated successfully to ${updatedVersion}.`
        : `SF CLI update ran, but installed version is ${updatedVersion} while latest is ${result.latestVersion}.`;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.message = 'SF CLI check failed.';
  }

  const history = loadHistory();
  history.push(result);
  saveHistory(history.slice(-90));
  writeStatusMd(result);
  writeHistoryMd(history.slice(-90));

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(0);
}

main();
