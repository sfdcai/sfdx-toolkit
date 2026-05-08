import fs from 'fs';
import os from 'os';
import path from 'path';
import { sfCliPath } from './config';

export function getSfCommand() {
  if (sfCliPath && fs.existsSync(sfCliPath)) {
    return sfCliPath;
  }
  return 'sf';
}

function ensureWritableDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
  return dir;
}

export function getSfEnv() {
  const env = { ...process.env };
  const requestedHome = process.env.SF_HOME_DIR || env.HOME || os.homedir() || '/tmp';
  try {
    env.HOME = ensureWritableDir(requestedHome);
  } catch {
    env.HOME = ensureWritableDir(path.join('/tmp', 'sfdx-toolkit-home'));
  }
  env.SF_STATE_FOLDER = process.env.SF_STATE_FOLDER || path.join(env.HOME, '.sf');
  return env;
}
