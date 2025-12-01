import express from 'express';
import fs from 'fs';
import path from 'path';
import { listProjects, upsertProject, getProject, listOrgs } from '../services/store.js';
import { authenticate } from '../middleware/auth.js';
import { ensureUserDirs, projectPaths, resolveUserPath } from '../utils/pathUtils.js';

const router = express.Router();

router.use(authenticate);

router.get('/', (req, res) => {
  res.json(listProjects(req.user.id));
});

router.post('/', (req, res) => {
  const { name } = req.body;
  ensureUserDirs(req.user.id);
  const project = {
    id: undefined,
    userId: req.user.id,
    name,
    sourceOrg: null,
    destinationOrg: null
  };
  const record = upsertProject(project);
  projectPaths(req.user.id, record.name);
  res.status(201).json(record);
});

router.post('/:id/orgs', (req, res) => {
  const { sourceOrg, destinationOrg } = req.body;
  const project = getProject(req.user.id, req.params.id);
  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }
  const orgAliases = listOrgs(req.user.id).map((o) => o.alias);
  if ((sourceOrg && !orgAliases.includes(sourceOrg)) || (destinationOrg && !orgAliases.includes(destinationOrg))) {
    return res.status(400).json({ message: 'Org alias not available to user' });
  }
  project.sourceOrg = sourceOrg ?? project.sourceOrg;
  project.destinationOrg = destinationOrg ?? project.destinationOrg;
  upsertProject(project);
  res.json(project);
});

router.get('/:id/manifests', (req, res) => {
  const project = getProject(req.user.id, req.params.id);
  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }
  const paths = projectPaths(req.user.id, project.name);
  const manifestContent = (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '');
  res.json({
    source: manifestContent(paths.manifests.source),
    destination: manifestContent(paths.manifests.destination),
    delta: manifestContent(paths.manifests.delta)
  });
});

router.post('/:id/manifests/:type', (req, res) => {
  const project = getProject(req.user.id, req.params.id);
  const { type } = req.params;
  const { xml } = req.body;
  if (!project || !['source', 'destination', 'delta'].includes(type)) {
    return res.status(404).json({ message: 'Project or manifest not found' });
  }
  const paths = projectPaths(req.user.id, project.name);
  const manifestPath = paths.manifests[type];
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, xml || '');
  res.json({ message: 'Manifest saved', path: manifestPath });
});

router.post('/:id/retrieve/:target', (req, res) => {
  const project = getProject(req.user.id, req.params.id);
  const { target } = req.params;
  if (!project || !['source', 'destination'].includes(target)) {
    return res.status(404).json({ message: 'Project or target not found' });
  }
  const paths = projectPaths(req.user.id, project.name);
  const folder = paths[target];
  fs.mkdirSync(path.join(folder, 'force-app'), { recursive: true });
  const logFile = path.join(folder, 'logs', `${target}-retrieve.log`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, `Retrieval stub for ${target} at ${new Date().toISOString()}`);
  res.json({ message: `Retrieval started for ${target}`, logFile });
});

router.post('/:id/compare', (req, res) => {
  const project = getProject(req.user.id, req.params.id);
  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }
  const paths = projectPaths(req.user.id, project.name);
  const diffLog = resolveUserPath(req.user.id, 'projects', project.name, 'deploy', 'logs', 'comparison.csv');
  fs.mkdirSync(path.dirname(diffLog), { recursive: true });
  fs.writeFileSync(diffLog, 'type,name,status\nApexClass,SampleController,Changed');
  res.json({ message: 'Comparison generated', diffLog, deltaManifest: paths.manifests.delta });
});

router.post('/:id/deploy', (req, res) => {
  const project = getProject(req.user.id, req.params.id);
  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }
  const deployLog = resolveUserPath(req.user.id, 'projects', project.name, 'deploy', 'logs', 'deployment.log');
  fs.mkdirSync(path.dirname(deployLog), { recursive: true });
  fs.writeFileSync(deployLog, `Deployment simulated at ${new Date().toISOString()}`);
  res.json({ message: 'Deployment kicked off', deployLog });
});

export default router;
