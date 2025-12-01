import path from 'path';
import fs from 'fs';
import { userRoot } from '../config.js';

export function resolveUserPath(userId, ...segments) {
  const base = path.resolve(path.join(userRoot, userId));
  const target = path.resolve(path.join(base, ...segments));
  if (!target.startsWith(base)) {
    throw new Error('Path escapes user sandbox');
  }
  return target;
}

export function ensureUserDirs(userId) {
  const base = resolveUserPath(userId);
  const projectDir = resolveUserPath(userId, 'projects');
  const orgDir = resolveUserPath(userId, 'orgs');
  [base, projectDir, orgDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export function projectPaths(userId, projectName) {
  const root = resolveUserPath(userId, 'projects', projectName);
  const paths = {
    root,
    source: path.join(root, 'source'),
    destination: path.join(root, 'destination'),
    deploy: path.join(root, 'deploy')
  };
  [
    paths.root,
    paths.source,
    paths.destination,
    paths.deploy,
    path.join(paths.deploy, 'logs'),
    path.join(paths.source, 'manifest'),
    path.join(paths.destination, 'manifest'),
    path.join(paths.deploy, 'manifest')
  ].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  return {
    ...paths,
    manifests: {
      source: path.join(paths.source, 'manifest', 'package.xml'),
      destination: path.join(paths.destination, 'manifest', 'package.xml'),
      delta: path.join(paths.deploy, 'manifest', 'delta-package.xml')
    }
  };
}
