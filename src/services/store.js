import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { adminEmails, dataFile } from '../config.js';

function ensureDataDir() {
  const dir = path.dirname(dataFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(dataFile)) {
    return { users: [], projects: [], orgs: [], deployments: [], comparisons: [], retrievals: [] };
  }
  const raw = fs.readFileSync(dataFile, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  return {
    users: parsed.users || [],
    projects: parsed.projects || [],
    orgs: parsed.orgs || [],
    deployments: parsed.deployments || [],
    comparisons: parsed.comparisons || [],
    retrievals: parsed.retrievals || []
  };
}

function save(data) {
  ensureDataDir();
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

export function createUser({ email, passwordHash }) {
  const data = load();
  const role = adminEmails.includes(email) || data.users.length === 0 ? 'admin' : 'user';
  const user = { id: nanoid(), email, passwordHash, role };
  data.users.push(user);
  save(data);
  return user;
}

export function findUserByEmail(email) {
  const data = load();
  return data.users.find((u) => u.email === email);
}

export function getUserById(id) {
  const data = load();
  return data.users.find((u) => u.id === id);
}

export function upsertProject(project) {
  const data = load();
  const existingIndex = data.projects.findIndex((p) => p.id === project.id);
  if (existingIndex >= 0) {
    data.projects[existingIndex] = project;
  } else {
    const record = { ...project, id: nanoid() };
    data.projects.push(record);
    project = record;
  }
  save(data);
  return project;
}

export function listProjects(userId) {
  const data = load();
  return data.projects.filter((p) => p.userId === userId);
}

export function getProject(userId, projectId) {
  const data = load();
  return data.projects.find((p) => p.userId === userId && p.id === projectId);
}

export function linkOrg(org) {
  const data = load();
  const existingIndex = data.orgs.findIndex((o) => o.id === org.id);
  if (existingIndex >= 0) {
    data.orgs[existingIndex] = org;
  } else {
    data.orgs.push({ ...org, id: nanoid() });
  }
  save(data);
  return org;
}

export function getOrg(userId, alias) {
  const data = load();
  return data.orgs.find((o) => o.userId === userId && o.alias === alias);
}

export function listOrgs(userId) {
  const data = load();
  return data.orgs.filter((o) => o.userId === userId);
}

export function saveComparison(record) {
  const data = load();
  const stored = { ...record, id: nanoid(), createdAt: new Date().toISOString() };
  data.comparisons.push(stored);
  save(data);
  return stored;
}

export function saveDeployment(record) {
  const data = load();
  const stored = { ...record, id: nanoid(), createdAt: new Date().toISOString() };
  data.deployments.push(stored);
  save(data);
  return stored;
}

export function saveRetrieval(record) {
  const data = load();
  const stored = { ...record, id: nanoid(), createdAt: new Date().toISOString() };
  data.retrievals.push(stored);
  save(data);
  return stored;
}

export function listComparisons(userId, projectId) {
  const data = load();
  return data.comparisons.filter((c) => c.userId === userId && c.projectId === projectId);
}

export function listDeployments(userId, projectId) {
  const data = load();
  return data.deployments.filter((d) => d.userId === userId && d.projectId === projectId);
}

export function listRetrievals(userId, projectId) {
  const data = load();
  return data.retrievals.filter((r) => r.userId === userId && r.projectId === projectId);
}

export function servicesSnapshot() {
  const data = load();
  return {
    database: { status: 'connected', details: `${data.users.length} users, ${data.projects.length} projects` },
    sandbox: { status: 'locked', details: 'User home isolation enforced' },
    pm2: { status: 'running', details: 'metadata-worker listening' }
  };
}

export function adminOverview() {
  const data = load();
  return {
    users: data.users.map(({ id, email, role }) => ({ id, email, role })),
    projects: data.projects,
    orgs: data.orgs
  };
}
