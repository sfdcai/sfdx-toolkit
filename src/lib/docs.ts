import fs from 'fs';
import path from 'path';

const docsRoot = path.resolve('docs');
const privateRoot = path.join(docsRoot, 'private');
const userGuideFile = path.join(docsRoot, 'user-guide.md');

function listMarkdownFiles(root: string, base = root): string[] {
  if (!fs.existsSync(root)) return [] as string[];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return listMarkdownFiles(fullPath, base);
      }
      if (!entry.name.endsWith('.md')) return [];
      return [path.relative(base, fullPath).replace(/\\/g, '/')];
    })
    .sort((a, b) => a.localeCompare(b));
}

function safeResolve(root: string, name: string) {
  const filePath = path.resolve(path.join(root, name));
  if (!filePath.startsWith(root)) {
    throw new Error('Invalid path');
  }
  return filePath;
}

export function listPublicDocs() {
  if (!fs.existsSync(docsRoot)) return [] as string[];
  return fs
    .readdirSync(docsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.md') && name !== 'user-guide.md')
    .sort((a, b) => a.localeCompare(b));
}

export function readPublicDoc(name: string) {
  const filePath = safeResolve(docsRoot, name);
  if (filePath === userGuideFile || filePath.startsWith(privateRoot)) {
    throw new Error('Invalid path');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function listPrivateDocs() {
  return listMarkdownFiles(privateRoot);
}

export function readPrivateDoc(name: string) {
  const filePath = safeResolve(privateRoot, name);
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function readUserGuide() {
  if (!fs.existsSync(userGuideFile)) {
    throw new Error('File not found');
  }
  return fs.readFileSync(userGuideFile, 'utf8');
}
