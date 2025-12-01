import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail } from '../services/store.js';
import { jwtSecret } from '../config.js';
import { ensureUserDirs } from '../utils/pathUtils.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }
  if (findUserByEmail(email)) {
    return res.status(400).json({ message: 'User already exists' });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = createUser({ email, passwordHash: hash });
  ensureUserDirs(user.id);
  const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, email: user.email } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, email: user.email } });
});

export default router;
