import express from 'express';
import fs from 'fs';
import path from 'path';
import { linkOrg, listOrgs, getOrg } from '../services/store.js';
import { authenticate } from '../middleware/auth.js';
import { resolveUserPath } from '../utils/pathUtils.js';

const router = express.Router();

router.use(authenticate);

router.get('/', (req, res) => {
  res.json(listOrgs(req.user.id));
});

router.post('/', (req, res) => {
  const { alias, auth, info = {} } = req.body;
  if (!alias || !auth) {
    return res.status(400).json({ message: 'Alias and auth data are required' });
  }
  const orgPath = resolveUserPath(req.user.id, 'orgs', alias);
  fs.mkdirSync(orgPath, { recursive: true });
  fs.writeFileSync(path.join(orgPath, 'auth.json'), JSON.stringify(auth, null, 2));
  fs.writeFileSync(path.join(orgPath, 'org-info.json'), JSON.stringify(info, null, 2));
  const org = linkOrg({ id: undefined, userId: req.user.id, alias, info });
  res.status(201).json(org);
});

router.get('/:alias', (req, res) => {
  const org = getOrg(req.user.id, req.params.alias);
  if (!org) {
    return res.status(404).json({ message: 'Org not found' });
  }
  const orgPath = resolveUserPath(req.user.id, 'orgs', org.alias);
  const infoPath = path.join(orgPath, 'org-info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : {};
  res.json({ ...org, info });
});

export default router;
