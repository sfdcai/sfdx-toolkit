import fs from 'fs';
import path from 'path';
import { userRoot } from '../config.js';

function log(message) {
  const logPath = path.join(userRoot, 'worker.log');
  fs.mkdirSync(userRoot, { recursive: true });
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
}

function main() {
  log('Metadata worker active - ready for background jobs');
  setInterval(() => {
    log('Heartbeat: worker monitoring background tasks');
  }, 60000);
}

main();
