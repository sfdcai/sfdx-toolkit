import express from 'express';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  listDeployments,
  listComparisons,
  listRetrievals,
  listProjects,
  listOrgs,
  servicesSnapshot,
  adminOverview
} from '../services/store.js';
import { userRoot } from '../config.js';

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/summary', (req, res) => {
  res.json({
    projects: listProjects(req.user.id),
    orgs: listOrgs(req.user.id),
    services: servicesSnapshot(),
    admin: adminOverview()
  });
});

router.get('/logs', (req, res) => {
  const workerLog = `${userRoot}/worker.log`;
  const content = fs.existsSync(workerLog) ? fs.readFileSync(workerLog, 'utf8') : '';
  res.json({ workerLog: content.split('\n').filter(Boolean).slice(-200) });
});

router.get('/projects/:projectId/history', (req, res) => {
  const { projectId } = req.params;
  res.json({
    retrievals: listRetrievals(req.user.id, projectId),
    comparisons: listComparisons(req.user.id, projectId),
    deployments: listDeployments(req.user.id, projectId)
  });
});

export default router;
