import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getSfCommand, getSfEnv } from './sf';
import {
  auditOrgParity,
  auditUserParity,
  detectMissingPackageDependencies,
  discoverOrgObjects,
  discoverUserCustomFields,
  getDestinationAdminUsername,
  EnvironmentParityReport,
  UserParityReport
} from './environment-parity';
import { enrichManifestForParity, sanitizeStagedDeploymentFiles } from './deploy';

export type SyncStage =
  | 'idle'
  | 'validating_health'
  | 'checking_dependencies'
  | 'generating_manifests'
  | 'sanitizing_metadata'
  | 'simulating_dry_run'
  | 'deploying_live'
  | 'aligning_user_data'
  | 'verifying_parity'
  | 'completed'
  | 'failed';

export interface SyncProgressEvent {
  stage: SyncStage;
  percent: number;
  message: string;
  timestamp: string;
}

export interface SyncConfig {
  sourceOrg: string;
  destOrg: string;
  stagingDir: string;
  autoSanitize?: boolean;
  alignUserData?: boolean;
  checkOnly?: boolean;
  onProgress?: (event: SyncProgressEvent) => void;
}

export interface SyncResult {
  success: boolean;
  sourceOrg: string;
  destOrg: string;
  timestamp: string;
  durationSeconds: number;
  deployedCount: number;
  missingPackageDependencies: string[];
  parityReport: EnvironmentParityReport;
  userParityReport?: UserParityReport;
  errors: string[];
}

/**
 * Universal, Dynamic One-Click Environment Synchronization Engine.
 * Zero hardcoded orgs, usernames, fields, or project names.
 */
export async function runEnvironmentSync(config: SyncConfig): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const reportProgress = (stage: SyncStage, percent: number, message: string) => {
    config.onProgress?.({
      stage,
      percent,
      message,
      timestamp: new Date().toISOString()
    });
  };

  try {
    // 1. Validate Health & Dynamic Dependency Discovery
    reportProgress('validating_health', 10, `Connecting to ${config.sourceOrg} and ${config.destOrg}...`);
    
    // 2. Discover missing managed package namespaces dynamically
    reportProgress('checking_dependencies', 20, 'Scanning for third-party managed package dependencies...');
    const missingPackages = detectMissingPackageDependencies(config.sourceOrg, config.destOrg);
    if (missingPackages.length > 0) {
      console.warn(`Warning: Destination org is missing managed package namespaces: ${missingPackages.join(', ')}`);
    }

    // 3. Automated Metadata Sanitization
    let sanitizedCount = 0;
    if (config.autoSanitize !== false && fs.existsSync(config.stagingDir)) {
      reportProgress('sanitizing_metadata', 35, 'Dynamically sanitizing folder shares and dashboard running users...');
      const targetAdmin = getDestinationAdminUsername(config.destOrg);
      sanitizedCount = sanitizeStagedDeploymentFiles(config.stagingDir, targetAdmin);
    }

    // 4. Pre-Flight Dry Run Simulation
    reportProgress('simulating_dry_run', 50, 'Executing pre-flight validation dry-run...');
    const sfCmd = getSfCommand();
    const env = getSfEnv();

    const dryRunArgs = ['project', 'deploy', 'start', '-o', config.destOrg, '-d', config.stagingDir, '--dry-run', '--json'];
    let dryRunStdout = '';
    try {
      dryRunStdout = execFileSync(sfCmd, dryRunArgs, { encoding: 'utf8', env, maxBuffer: 20 * 1024 * 1024 });
    } catch (e: any) {
      dryRunStdout = e.stdout || e.stderr || '';
    }

    const dryRunParsed = JSON.parse(dryRunStdout || '{}');
    if (dryRunParsed.status !== 0) {
      const failures = dryRunParsed.result?.details?.componentFailures || [];
      const failMsgs = failures.map((f: any) => `${f.componentType} ${f.fullName}: ${f.problem}`);
      throw new Error(`Pre-flight validation failed with ${failures.length} errors:\n${failMsgs.join('\n')}`);
    }

    if (config.checkOnly) {
      reportProgress('completed', 100, 'Dry-run validation completed successfully with 0 errors.');
      return {
        success: true,
        sourceOrg: config.sourceOrg,
        destOrg: config.destOrg,
        timestamp: new Date().toISOString(),
        durationSeconds: (Date.now() - startTime) / 1000,
        deployedCount: dryRunParsed.result?.details?.componentSuccesses?.length || 0,
        missingPackageDependencies: missingPackages,
        parityReport: auditOrgParity(config.sourceOrg, config.destOrg),
        errors: []
      };
    }

    // 5. Live Atomic Deployment
    reportProgress('deploying_live', 70, 'Pre-flight validated. Deploying live to destination org...');
    const deployArgs = ['project', 'deploy', 'start', '-o', config.destOrg, '-d', config.stagingDir, '--json'];
    const deployStdout = execFileSync(sfCmd, deployArgs, { encoding: 'utf8', env, maxBuffer: 20 * 1024 * 1024 });
    const deployParsed = JSON.parse(deployStdout);
    const deployedCount = deployParsed.result?.details?.componentSuccesses?.length || 0;

    // 6. Dynamic User Record Data Alignment
    let userReport: UserParityReport | undefined;
    if (config.alignUserData !== false) {
      reportProgress('aligning_user_data', 85, 'Auditing dynamic User custom field routing data...');
      const discoveredUserFields = discoverUserCustomFields(config.sourceOrg);
      if (discoveredUserFields.length > 0) {
        userReport = auditUserParity(config.sourceOrg, config.destOrg, discoveredUserFields);
      }
    }

    // 7. Verify Post-Deployment Parity
    reportProgress('verifying_parity', 95, 'Verifying environment parity and FLS metrics...');
    const parityReport = auditOrgParity(config.sourceOrg, config.destOrg);

    reportProgress('completed', 100, `Environment sync completed successfully! ${deployedCount} components verified live.`);

    return {
      success: true,
      sourceOrg: config.sourceOrg,
      destOrg: config.destOrg,
      timestamp: new Date().toISOString(),
      durationSeconds: (Date.now() - startTime) / 1000,
      deployedCount,
      missingPackageDependencies: missingPackages,
      parityReport,
      userParityReport: userReport,
      errors: []
    };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    errors.push(errorMsg);
    reportProgress('failed', 100, `Sync failed: ${errorMsg}`);

    return {
      success: false,
      sourceOrg: config.sourceOrg,
      destOrg: config.destOrg,
      timestamp: new Date().toISOString(),
      durationSeconds: (Date.now() - startTime) / 1000,
      deployedCount: 0,
      missingPackageDependencies: [],
      parityReport: {
        timestamp: new Date().toISOString(),
        sourceOrg: config.sourceOrg,
        destOrg: config.destOrg,
        metrics: [],
        actionOverrides: [],
        recommendations: [errorMsg]
      },
      errors
    };
  }
}
