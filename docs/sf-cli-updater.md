# SF CLI Updater

This repository includes a daily Salesforce CLI update checker.

## What It Does

- Reads the currently installed `sf` version
- Checks the latest published `@salesforce/cli` version from npm
- Runs `sf update` when a newer version is available
- Updates these markdown files after every run:
  - `docs/sf-cli-status.md`
  - `docs/sf-cli-update-history.md`

## Commands

- Check only:
  - `node scripts/check-sf-cli-update.cjs --check-only`
- Run check and update:
  - `node scripts/check-sf-cli-update.cjs`
- Install the daily background timer:
  - `node scripts/install-sf-cli-update-service.cjs`

## Service Names

- `sfdx-sf-cli-update.service`
- `sfdx-sf-cli-update.timer`

## Notes

- The installer writes `systemd` unit files into `/etc/systemd/system`.
- The timer runs once per day and persists missed runs across reboots.
- The default SF binary path is `/root/cli/sf/bin/sf`, but you can override it with `SF_BIN`.
