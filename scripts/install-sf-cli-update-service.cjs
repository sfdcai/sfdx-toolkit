#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const SERVICE_NAME = 'sfdx-sf-cli-update.service';
const TIMER_NAME = 'sfdx-sf-cli-update.timer';
const SYSTEMD_DIR = '/etc/systemd/system';

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
}

function buildService() {
  return `[Unit]
Description=Daily Salesforce CLI update check
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${ROOT}
Environment=HOME=/root
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/usr/bin/env node ${path.join(ROOT, 'scripts', 'check-sf-cli-update.cjs')}

[Install]
WantedBy=multi-user.target
`;
}

function buildTimer() {
  return `[Unit]
Description=Run Salesforce CLI update check daily

[Timer]
OnCalendar=daily
Persistent=true
Unit=${SERVICE_NAME}

[Install]
WantedBy=timers.target
`;
}

function main() {
  const servicePath = path.join(SYSTEMD_DIR, SERVICE_NAME);
  const timerPath = path.join(SYSTEMD_DIR, TIMER_NAME);
  fs.writeFileSync(servicePath, buildService());
  fs.writeFileSync(timerPath, buildTimer());
  run('systemctl', ['daemon-reload']);
  run('systemctl', ['enable', SERVICE_NAME]);
  run('systemctl', ['enable', '--now', TIMER_NAME]);
  console.log(`Installed ${SERVICE_NAME} and ${TIMER_NAME}.`);
}

main();
