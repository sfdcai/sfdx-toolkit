import fs from 'fs';
import path from 'path';
import { deployWithCli } from './deploy';
import { buildPackageXml, ensureSfdxProject, mapRelPathToMetadata, parseManifestComponents, splitManifestIntoLayers } from './metadata';
import { projectPaths, resolveUserPath } from './path';
import { getProject, JobRecord, saveDeployment, updateJob } from './store';
import { getFeatureFlag } from './feature-flags';
import { executeAutoHealing } from './agents/agent-engine';

export type DeployJobPayload = {
  jobId: string;
  testLevel?: string;
  runTests?: string[];
  checkOnly?: boolean;
  autoRetry?: boolean;
  retryLimit?: number;
  manifestPath?: string | null;
  components?: string[];
  ignoreDestructive?: boolean;
  deployType?: 'delta' | 'full' | 'manifest';
  manifestContent?: string;
};

function writeStatus(statusPath: string, payload: Record<string, unknown>) {
  fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2), 'utf8');
}

export async function runDeployJob(job: JobRecord) {
  const payload = job.payload as DeployJobPayload;
  const project = getProject(job.userId, job.projectId);
  if (!project) {
    updateJob(job.id, { status: 'failed', error: 'Project not found', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    throw new Error('Project not found for deployment job.');
  }
  if (!project.destinationOrg) {
    updateJob(job.id, { status: 'failed', error: 'Destination org not set', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    throw new Error('Destination org not set on project.');
  }

  const paths = projectPaths(job.userId, project.name);
  const jobDir = resolveUserPath(job.userId, 'projects', project.name, 'deploy', 'logs', 'deployments', job.id);
  fs.mkdirSync(jobDir, { recursive: true });
  const statusPath = path.join(jobDir, 'job-status.json');
  const deployLog = path.join(jobDir, 'deploy.log');
  const orgPath = resolveUserPath(job.userId, 'orgs', project.destinationOrg);
  const infoPath = path.join(orgPath, 'org-info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : {};
  const selectionPath = path.join(paths.deploy, 'selection.json');
  const selectionData = fs.existsSync(selectionPath) ? JSON.parse(fs.readFileSync(selectionPath, 'utf8')) : null;
  const selectionPaths: string[] = Array.isArray(selectionData?.selection)
    ? selectionData.selection.filter((value: unknown): value is string => typeof value === 'string')
    : [];

  // Snapshot destructive changes into the per-job dir so a stale shared
  // deploy/manifest/destructiveChanges.xml can't ride along with an unrelated deploy and
  // concurrent deploys can't clobber each other. Only `delta` deploys delete — `manifest`
  // and `full` deploys are purely additive and never carry destructive changes.
  let destructivePath: string | null = null;
  if (!payload.ignoreDestructive && (payload.deployType || 'delta') === 'delta') {
    const sharedDestructive = path.join(paths.deploy, 'manifest', 'destructiveChanges.xml');
    if (fs.existsSync(sharedDestructive)) {
      destructivePath = path.join(jobDir, 'destructiveChanges.xml');
      fs.copyFileSync(sharedDestructive, destructivePath);
    }
  }

  ensureSfdxProject(paths.deploy, info.apiVersion);
  writeStatus(statusPath, {
    jobId: job.id,
    projectId: project.id,
    status: 'running',
    phase: payload.checkOnly ? 'validating' : 'staging',
    progressPercent: 25,
    startedAt: job.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deployLog: path.relative(paths.root, deployLog),
    summary: payload.checkOnly ? 'Validating metadata dependencies...' : 'Staging metadata files and delta package...'
  });

  try {
    let result: any;
    const initialManifestPath = payload.manifestPath || paths.manifests.delta;
    
    // Initial attempt: All together
    writeStatus(statusPath, {
      jobId: job.id,
      projectId: project.id,
      status: 'running',
      phase: payload.checkOnly ? 'validating' : 'deploying',
      progressPercent: 50,
      startedAt: job.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deployLog: path.relative(paths.root, deployLog),
      summary: payload.checkOnly ? 'Running Salesforce CLI dry-run validation (wait up to 60m)...' : 'Executing Salesforce CLI deployment to target org (wait up to 60m)...'
    });
    result = deployWithCli({
      projectPath: paths.deploy,
      deployLogPath: deployLog,
      manifestPath: initialManifestPath,
      testLevel: payload.testLevel,
      runTests: payload.runTests || [],
      checkOnly: payload.checkOnly || false,
      autoRetry: payload.autoRetry !== false,
      retryLimit: payload.retryLimit,
      components: payload.components || [],
      targetOrg: project.destinationOrg,
      apiVersion: info.apiVersion,
      sourcePath: paths.source,
      selectionPaths,
      ignoreDestructive: payload.ignoreDestructive || false,
      destinationPath: paths.destination,
      deployType: payload.deployType || 'delta',
      manifestContent: payload.manifestContent,
      destructivePath
    });

    // If failed and autoRetry is enabled, try Layered Deployment (Pass 2, 3, etc.)
    if (result.status === 'Failed' && payload.autoRetry !== false && fs.existsSync(initialManifestPath)) {
      const xml = fs.readFileSync(initialManifestPath, 'utf8');
      const components = parseManifestComponents(xml);
      const layers = splitManifestIntoLayers(components);
      
      const hasComplexLayers = layers.layer1.length > 0 || layers.layer2.length > 0 || layers.layer3.length > 0;
      
      if (hasComplexLayers) {
        fs.appendFileSync(deployLog, `\n\n--- STARTING MULTI-PASS LAYERED DEPLOYMENT ---\n`);
        
        const passes = [
          { name: 'Layer 1: Infrastructure', types: layers.layer1 },
          { name: 'Layer 0: Standard Metadata', types: layers.layer0 },
          { name: 'Layer 2: Experience Rules', types: layers.layer2 },
          { name: 'Layer 3: Access & Security', types: layers.layer3 }
        ].filter(p => p.types.length > 0);

        let allSucceeded = true;
        const layeredResults: any[] = [];
        const failedInPasses: string[] = [];

        for (const pass of passes) {
          const passManifestPath = path.join(jobDir, `pass-${pass.name.replace(/[^a-z0-9]/gi, '_')}.xml`);
          const passXml = buildPackageXml(pass.types, info.apiVersion);
          fs.writeFileSync(passManifestPath, passXml, 'utf8');
          
          fs.appendFileSync(deployLog, `\n>>> RUNNING PASS: ${pass.name}\n`);
          
          const passResult = deployWithCli({
            projectPath: paths.deploy,
            deployLogPath: deployLog,
            manifestPath: passManifestPath,
            testLevel: 'NoTestRun', // Faster for intermediate passes
            targetOrg: project.destinationOrg,
            apiVersion: info.apiVersion,
            sourcePath: undefined, // Files are already staged from initial attempt, do not re-stage or wipe
            selectionPaths: [],
            ignoreDestructive: true,
            destinationPath: paths.destination,
            destructivePath: null
          });
          
          layeredResults.push({ pass: pass.name, result: passResult });
          if (passResult.status === 'Failed') {
            allSucceeded = false;
            failedInPasses.push(...(passResult.failedComponents || []));
          }
        }

        if (allSucceeded) {
          result.status = 'SucceededWithRetry';
          result.summary = 'Succeeded after multi-pass layered deployment';
        } else {
          result.failedComponents = [...new Set(failedInPasses)];
        }
        result.layeredResults = layeredResults;
      }
    }

    // AI Autonomous Self-Healing Integration
    if (result.status === 'Failed' && result.failedComponents?.length) {
      const healingFeature = getFeatureFlag(project.tenantId, 'autonomous_healing');
      if (healingFeature && healingFeature.enabled) {
        fs.appendFileSync(deployLog, `\n\n--- INITIATING AUTONOMOUS AI SELF-HEALING INTERVENTION ---\n`);
        
        const failuresList = result.output?.result?.details?.componentFailures || 
                             result.output?.result?.details?.componentFailure || 
                             result.output?.details?.componentFailures || 
                             result.output?.details?.componentFailure || 
                             [];
        const failuresArray = Array.isArray(failuresList) ? failuresList : [failuresList];

        try {
          const healResult = await executeAutoHealing({
            tenantId: project.tenantId,
            projectId: project.id,
            jobId: job.id,
            failures: failuresArray,
            sourceDir: paths.source,
            deployDir: paths.deploy
          });

          fs.appendFileSync(deployLog, `\nAI AGENT DIAGNOSTIC: ${healResult.summary}\n`);

          if (healResult.healed) {
            fs.appendFileSync(deployLog, `\nAI AGENT: Healing succeeded. Triggering deployment retry...\n`);
            const retryResult = deployWithCli({
              projectPath: paths.deploy,
              deployLogPath: deployLog,
              manifestPath: payload.manifestPath || paths.manifests.delta,
              testLevel: payload.testLevel,
              runTests: payload.runTests || [],
              checkOnly: payload.checkOnly || false,
              autoRetry: false, // Don't run layered deployment retries recursively
              components: payload.components || [],
              targetOrg: project.destinationOrg,
              apiVersion: info.apiVersion,
              sourcePath: paths.source,
              selectionPaths: [],
              ignoreDestructive: payload.ignoreDestructive || false,
              destinationPath: paths.destination,
              destructivePath
            });

            fs.appendFileSync(deployLog, `\nAI AGENT RETRY RESULT: ${retryResult.status}\n`);

            if (retryResult.status !== 'Failed') {
              result = retryResult;
              result.status = 'SucceededWithRetry';
              
              // Update agent run record
              const { getDb } = require('./db');
              const db = getDb();
              db.prepare("UPDATE agent_runs SET status = 'healed', completed_at = ? WHERE job_id = ? AND status = 'running'")
                .run(new Date().toISOString(), job.id);
            } else {
              const { getDb } = require('./db');
              const db = getDb();
              db.prepare("UPDATE agent_runs SET status = 'failed', completed_at = ? WHERE job_id = ? AND status = 'running'")
                .run(new Date().toISOString(), job.id);
              result = retryResult;
            }
          }
        } catch (healErr: any) {
          fs.appendFileSync(deployLog, `\nAI AGENT ERROR: ${healErr.message}\n`);
        }
      }
    }

    if ((payload.autoRetry !== false) && result.failedComponents?.length && selectionPaths.length) {
      const failed = new Set(result.failedComponents);
      const filtered = selectionPaths.filter((relPath: string) => {
        const mapped = mapRelPathToMetadata(relPath);
        return !failed.has(`${mapped.type}:${mapped.name}`);
      });
      fs.writeFileSync(
        selectionPath,
        JSON.stringify({ updatedAt: new Date().toISOString(), selection: filtered }, null, 2),
        'utf8'
      );
    }

    const normalizedResult = { ...result, output: result.output ?? {} };
    const record = saveDeployment({
      userId: job.userId,
      tenantId: project.tenantId,
      projectId: project.id,
      ...normalizedResult
    });
    const finalStatus = normalizedResult.status === 'Failed' ? 'failed' : 'done';
    const now = new Date().toISOString();
    writeStatus(statusPath, {
      jobId: job.id,
      projectId: project.id,
      status: finalStatus,
      phase: finalStatus === 'done' ? (payload.checkOnly ? 'validated' : 'succeeded') : 'failed',
      progressPercent: finalStatus === 'done' ? 100 : 0,
      summary: finalStatus === 'done' ? (payload.checkOnly ? 'Pre-flight validation passed successfully.' : 'Metadata deployment succeeded.') : 'Deployment failed.',
      startedAt: job.startedAt || job.createdAt,
      completedAt: now,
      updatedAt: now,
      deployLog: path.relative(paths.root, deployLog),
      result: {
        status: normalizedResult.status,
        attempts: normalizedResult.attempts,
        failedComponents: normalizedResult.failedComponents,
        manifestPath: normalizedResult.manifestPath
      },
      record
    });
    updateJob(job.id, {
      status: finalStatus,
      completedAt: now,
      updatedAt: now,
      error: finalStatus === 'failed' ? 'Deployment failed' : null
    });
  } catch (err) {
    const now = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    writeStatus(statusPath, {
      jobId: job.id,
      projectId: project.id,
      status: 'failed',
      startedAt: job.startedAt || job.createdAt,
      completedAt: now,
      updatedAt: now,
      deployLog: path.relative(paths.root, deployLog),
      error: message
    });
    updateJob(job.id, {
      status: 'failed',
      completedAt: now,
      updatedAt: now,
      error: message
    });
    throw err;
  }
}
