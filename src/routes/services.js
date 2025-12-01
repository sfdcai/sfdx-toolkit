import express from 'express';
import { servicesSnapshot } from '../services/store.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(servicesSnapshot());
});

export default router;
