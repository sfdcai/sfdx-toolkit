import jwt from 'jsonwebtoken';
import { jwtSecret } from '../config.js';
import { getUserById } from '../services/store.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ message: 'Missing auth header' });
  }
  const token = header.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
}
