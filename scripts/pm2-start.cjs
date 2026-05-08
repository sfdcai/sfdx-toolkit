#!/usr/bin/env node
const { execFileSync, spawn } = require('child_process');

function listPortPids(port) {
  try {
    const output = execFileSync('ss', ['-ltnp'], { encoding: 'utf8' });
    return Array.from(output.matchAll(new RegExp(`:${port}\\s+.*?pid=(\\d+)`, 'g')))
      .map((match) => Number.parseInt(match[1], 10))
      .filter((pid) => Number.isInteger(pid));
  } catch {
    return [];
  }
}

function readCommand(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'cmd='], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function isStaleNextProcess(command) {
  return command.includes('next-server') || command.includes('next start');
}

function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function clearStalePortListeners(port) {
  const pids = listPortPids(port);
  for (const pid of pids) {
    if (pid === process.pid || pid === process.ppid) continue;
    const command = readCommand(pid);
    if (!isStaleNextProcess(command)) continue;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const active = listPortPids(port).filter((pid) => {
      if (pid === process.pid || pid === process.ppid) return false;
      return isStaleNextProcess(readCommand(pid)) && pidExists(pid);
    });
    if (!active.length) return;
    sleep(200);
  }

  for (const pid of listPortPids(port)) {
    if (pid === process.pid || pid === process.ppid) continue;
    const command = readCommand(pid);
    if (!isStaleNextProcess(command)) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
}

function main() {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOSTNAME || '0.0.0.0';
  clearStalePortListeners(port);

  const child = spawn('npm', ['run', 'start', '--', '--hostname', host, '--port', String(port)], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });
}

main();
