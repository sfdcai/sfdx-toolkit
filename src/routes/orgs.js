import express from 'express';
import fs from 'fs';
import path from 'path';
import { linkOrg, listOrgs } from '../services/store.js';
import { authenticate } from '../middleware/auth.js';
import { resolveUserPath } from '../utils/pathUtils.js';

const router = express.Router();

router.use(authenticate);

router.get('/', (req, res) => {
  res.json(listOrgs(req.user.id));
});

router.post('/', (req, res) => {
  const { alias, auth } = req.body;
  if (!alias || !auth) {
    return res.status(400).json({ message: 'Alias and auth data are required' });
  }
  const orgPath = resolveUserPath(req.user.id, 'orgs', alias);
  fs.mkdirSync(orgPath, { recursive: true });
  fs.writeFileSync(path.join(orgPath, 'auth.json'), JSON.stringify(auth, null, 2));
  const org = linkOrg({ id: undefined, userId: req.user.id, alias });
  res.status(201).json(org);
});

export default router;
