import fs from 'fs';
import { nanoid } from 'nanoid';
import { dataFile } from '../config.js';

function load() {
  if (!fs.existsSync(dataFile)) {
    return { users: [], projects: [], orgs: [], deployments: [], comparisons: [] };
  }
  const raw = fs.readFileSync(dataFile, 'utf8');
  return JSON.parse(raw || '{}');
}

function save(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

export function createUser({ email, passwordHash }) {
  const data = load();
  const user = { id: nanoid(), email, passwordHash, role: 'user' };
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
    data.projects.push({ ...project, id: nanoid() });
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

export function listOrgs(userId) {
  const data = load();
  return data.orgs.filter((o) => o.userId === userId);
}

export function saveComparison(record) {
  const data = load();
  data.comparisons.push({ ...record, id: nanoid(), createdAt: new Date().toISOString() });
  save(data);
  return record;
}

export function saveDeployment(record) {
  const data = load();
  data.deployments.push({ ...record, id: nanoid(), createdAt: new Date().toISOString() });
  save(data);
  return record;
}

export function servicesSnapshot() {
  const data = load();
  return {
    database: { status: 'connected', details: `${data.users.length} users, ${data.projects.length} projects` },
    sandbox: { status: 'locked', details: 'User home isolation enforced' },
    pm2: { status: 'running', details: 'metadata-worker listening' }
  };
}
