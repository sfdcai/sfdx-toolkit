import fs from 'fs';
import path from 'path';
import { apiVersion } from '../config.js';

export function buildPackageXml(types = []) {
  const body = types
    .map((type) => {
      const members = (type.members && type.members.length ? type.members : ['*'])
        .map((member) => `    <members>${member}</members>`) // indent 4 spaces
        .join('\n');
      return `  <types>\n${members}\n    <name>${type.name}</name>\n  </types>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${body}\n  <version>${apiVersion}</version>\n</Package>`;
}

function ensureDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

export function saveManifest(manifestPath, types = []) {
  const xml = buildPackageXml(types);
  ensureDir(manifestPath);
  fs.writeFileSync(manifestPath, xml, 'utf8');
  return xml;
}

export function simulateChunkedRetrieval(targetLabel, folder, types = []) {
  const logPath = path.join(folder, 'logs', `${targetLabel}-retrieve.log`);
  ensureDir(logPath);
  const forceApp = path.join(folder, 'force-app');
  const entries = [];
  types.forEach((type) => {
    const members = type.members?.length ? type.members : [`Sample${type.name}`];
    members.forEach((member) => {
      const filePath = path.join(forceApp, type.name, `${member}.txt`);
      ensureDir(filePath);
      const content = `// ${type.name}:${member}\nRetrieved at ${new Date().toISOString()}`;
      fs.writeFileSync(filePath, content, 'utf8');
      entries.push({ type: type.name, member, status: 'Retrieved', filePath });
    });
  });
  const logLines = entries.map((e) => `${e.type},${e.member},${e.status},${e.filePath}`);
  fs.writeFileSync(logPath, logLines.join('\n'), 'utf8');
  return { entries, logPath };
}

function walkFiles(baseDir) {
  const results = {};
  if (!fs.existsSync(baseDir)) return results;
  const stack = [baseDir];
  while (stack.length) {
    const current = stack.pop();
    const stats = fs.statSync(current);
    if (stats.isDirectory()) {
      fs.readdirSync(current).forEach((child) => stack.push(path.join(current, child)));
    } else {
      const rel = path.relative(baseDir, current);
      results[rel] = fs.readFileSync(current, 'utf8');
    }
  }
  return results;
}

export function diffWorkspaces(sourceDir, destinationDir) {
  const src = walkFiles(path.join(sourceDir, 'force-app'));
  const dest = walkFiles(path.join(destinationDir, 'force-app'));
  const allPaths = new Set([...Object.keys(src), ...Object.keys(dest)]);
  const changes = [];
  allPaths.forEach((relPath) => {
    if (!src[relPath]) {
      changes.push(recordChange(relPath, 'Added'));
    } else if (!dest[relPath]) {
      changes.push(recordChange(relPath, 'Removed'));
    } else if (src[relPath] !== dest[relPath]) {
      changes.push(recordChange(relPath, 'Changed'));
    }
  });
  return changes;
}

function recordChange(relPath, status) {
  const parts = relPath.split(path.sep);
  const type = parts[0] || 'Unknown';
  const name = parts.slice(1).join('/') || relPath;
  return { type, name, status, relPath };
}

export function writeComparisonCsv(csvPath, changes) {
  ensureDir(csvPath);
  const header = 'type,name,status,path';
  const body = changes.map((c) => `${c.type},${c.name},${c.status},${c.relPath}`).join('\n');
  const content = `${header}\n${body}`;
  fs.writeFileSync(csvPath, content, 'utf8');
  return csvPath;
}

export function generateDeltaManifest(manifestPath, changes) {
  const included = changes.filter((c) => c.status === 'Added' || c.status === 'Changed');
  const types = {};
  included.forEach((change) => {
    if (!types[change.type]) types[change.type] = [];
    const name = change.name.replace(/\.meta\.xml$/, '');
    types[change.type].push(name);
  });
  const packageTypes = Object.entries(types).map(([name, members]) => ({
    name,
    members: [...new Set(members)]
  }));
  return saveManifest(manifestPath, packageTypes);
}

export function generateDestructiveChanges(destructivePath, changes) {
  const removed = changes.filter((c) => c.status === 'Removed');
  if (!removed.length) return null;
  const types = {};
  removed.forEach((change) => {
    if (!types[change.type]) types[change.type] = [];
    const name = change.name.replace(/\.meta\.xml$/, '');
    types[change.type].push(name);
  });
  const xml = buildPackageXml(
    Object.entries(types).map(([name, members]) => ({ name, members: [...new Set(members)] }))
  );
  ensureDir(destructivePath);
  fs.writeFileSync(destructivePath, xml, 'utf8');
  return xml;
}
