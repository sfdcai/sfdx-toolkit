import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  listProjects,
  upsertProject,
  getProject,
  listOrgs,
  saveComparison,
  saveDeployment,
  saveRetrieval,
  listComparisons,
  listDeployments,
  listRetrievals
} from '../services/store.js';
import { authenticate } from '../middleware/auth.js';
import { ensureUserDirs, projectPaths, resolveUserPath } from '../utils/pathUtils.js';
import {
  diffWorkspaces,
  generateDeltaManifest,
  generateDestructiveChanges,
  saveManifest,
  simulateChunkedRetrieval,
  writeComparisonCsv
} from '../services/metadata.js';
import { simulateDeploy } from '../services/deploy.js';

const defaultTypes = [
  { name: 'CustomObject', members: ['Account', 'Contact'] },
  { name: 'ApexClass', members: ['SampleController'] },
  { name: 'AuraDefinitionBundle', members: ['SampleBundle'] }
];

function getProjectOr404(req, res) {
  const project = getProject(req.user.id, req.params.id);
  if (!project) {
    res.status(404).json({ message: 'Project not found' });
    return null;
  }
  return project;
}

const router = express.Router();

router.use(authenticate);

router.get('/', (req, res) => {
  res.json(listProjects(req.user.id));
});

router.get('/:id', (req, res) => {
  const project = getProject(req.user.id, req.params.id);
  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }
  res.json(project);
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
  const project = getProjectOr404(req, res);
  if (!project) return;
  const paths = projectPaths(req.user.id, project.name);
  const manifestContent = (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '');
  res.json({
    source: manifestContent(paths.manifests.source),
    destination: manifestContent(paths.manifests.destination),
    delta: manifestContent(paths.manifests.delta)
  });
});

router.post('/:id/manifests/:type/generate', (req, res) => {
  const project = getProjectOr404(req, res);
  if (!project) return;
  const { type } = req.params;
  const { types = defaultTypes } = req.body;
  if (!['source', 'destination', 'delta'].includes(type)) {
    return res.status(400).json({ message: 'Unsupported manifest type' });
  }
  const paths = projectPaths(req.user.id, project.name);
  const manifestPath = paths.manifests[type];
  const xml = saveManifest(manifestPath, types);
  res.json({ message: 'Manifest generated', manifestPath, xml });
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
  const project = getProjectOr404(req, res);
  const { target } = req.params;
  const { types = defaultTypes } = req.body;
  if (!project || !['source', 'destination'].includes(target)) {
    return res.status(404).json({ message: 'Project or target not found' });
  }
  const paths = projectPaths(req.user.id, project.name);
  const folder = paths[target];
  const { entries, logPath } = simulateChunkedRetrieval(target, folder, types);
  const record = saveRetrieval({ userId: req.user.id, projectId: project.id, target, logPath, count: entries.length });
  res.json({ message: `Retrieval completed for ${target}`, logPath, entries, record });
});

router.post('/:id/compare', (req, res) => {
  const project = getProjectOr404(req, res);
  if (!project) return;
  const paths = projectPaths(req.user.id, project.name);
  const changes = diffWorkspaces(paths.source, paths.destination);
  const diffLog = resolveUserPath(req.user.id, 'projects', project.name, 'deploy', 'logs', 'comparison.csv');
  writeComparisonCsv(diffLog, changes);
  const deltaManifest = paths.manifests.delta;
  const destructiveManifest = path.join(paths.deploy, 'manifest', 'destructiveChanges.xml');
  generateDeltaManifest(deltaManifest, changes);
  generateDestructiveChanges(destructiveManifest, changes);
  const record = saveComparison({ userId: req.user.id, projectId: project.id, diffLog, changes });
  res.json({
    message: 'Comparison generated',
    diffLog,
    deltaManifest,
    destructiveManifest,
    changes,
    record
  });
});

router.post('/:id/deploy', (req, res) => {
  const project = getProjectOr404(req, res);
  if (!project) return;
  const { testLevel, runTests = [], checkOnly = false, autoRetry = true, manifestPath, components = [] } = req.body;
  const paths = projectPaths(req.user.id, project.name);
  const deployLog = resolveUserPath(req.user.id, 'projects', project.name, 'deploy', 'logs', 'deployment.log');
  const result = simulateDeploy({
    projectPath: paths.deploy,
    deployLogPath: deployLog,
    manifestPath: manifestPath || paths.manifests.delta,
    testLevel,
    runTests,
    checkOnly,
    autoRetry,
    components
  });
  const record = saveDeployment({ userId: req.user.id, projectId: project.id, ...result });
  res.json({ message: 'Deployment processed', deployLog, result, record });
});

router.get('/:id/history', (req, res) => {
  const project = getProjectOr404(req, res);
  if (!project) return;
  res.json({
    retrievals: listRetrievals(req.user.id, project.id),
    comparisons: listComparisons(req.user.id, project.id),
    deployments: listDeployments(req.user.id, project.id)
  });
});

export default router;
