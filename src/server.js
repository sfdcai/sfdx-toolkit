import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import orgRoutes from './routes/orgs.js';
import serviceRoutes from './routes/services.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static('public'));
app.get('*', (req, res) => {
  res.sendFile(path.resolve('public/index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`SFDX Toolkit listening on port ${port}`);
});
