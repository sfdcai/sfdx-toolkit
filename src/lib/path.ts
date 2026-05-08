import fs from 'fs';
import path from 'path';
import { userRoot } from './config';

export function resolveUserPath(userId: string, ...segments: string[]) {
  const base = path.resolve(path.join(userRoot, userId));
  const target = path.resolve(path.join(base, ...segments));
  if (!target.startsWith(base)) {
    throw new Error('Path escapes user sandbox');
  }
  return target;
}

export function ensureUserDirs(userId: string) {
  const base = resolveUserPath(userId);
  const projectDir = resolveUserPath(userId, 'projects');
  const orgDir = resolveUserPath(userId, 'orgs');
  [base, projectDir, orgDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export function projectPaths(userId: string, projectName: string) {
  const root = resolveUserPath(userId, 'projects', projectName);
  const source = path.join(root, 'source');
  const destination = path.join(root, 'destination');
  const deploy = path.join(root, 'deploy');
  [
    root,
    source,
    destination,
    deploy,
    path.join(source, 'force-app'),
    path.join(destination, 'force-app'),
    path.join(deploy, 'force-app'),
    path.join(source, 'manifest'),
    path.join(destination, 'manifest'),
    path.join(deploy, 'manifest'),
    path.join(source, 'logs'),
    path.join(destination, 'logs'),
    path.join(deploy, 'logs')
  ].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  return {
    root,
    source,
    destination,
    deploy,
    manifests: {
      source: path.join(source, 'manifest', 'package.xml'),
      destination: path.join(destination, 'manifest', 'package.xml'),
      delta: path.join(deploy, 'manifest', 'delta-package.xml')
    }
  };
}
