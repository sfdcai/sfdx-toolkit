import fs from 'fs';
import path from 'path';
import { saveAgentRun, updateAgentRun } from '../store';
import { extractMissingDependencies } from '../deploy';
import { healDependency } from './healers/dependency-healer';
import { healXmlFile } from './healers/xml-healer';
import { healWithLlm } from './healers/llm-healer';

export type DiagnosticResult = {
  healer: 'dependency' | 'xml' | 'llm' | 'none';
  filePath?: string;
  errorMessage: string;
  type?: string;
  fullName?: string;
};

export async function executeAutoHealing(params: {
  tenantId: string;
  projectId: string;
  jobId: string;
  failures: any[];
  sourceDir: string;
  deployDir: string;
}): Promise<{ healed: boolean; healersApplied: string[]; filesModified: string[]; summary: string }> {
  const { tenantId, projectId, jobId, failures, sourceDir, deployDir } = params;

  if (!failures || !failures.length) {
    return { healed: false, healersApplied: [], filesModified: [], summary: 'No failures to diagnose' };
  }

  const runRecord = saveAgentRun({
    tenantId,
    projectId,
    jobId,
    status: 'running',
    diagnosticSummary: `Diagnosing ${failures.length} deployment failures...`
  });

  const healersApplied: string[] = [];
  const filesModified: string[] = [];
  const diagnostics: DiagnosticResult[] = [];

  // 1. Check for missing dependencies
  const missingDeps = extractMissingDependencies(failures, sourceDir);
  missingDeps.forEach(dep => {
    diagnostics.push({
      healer: 'dependency',
      errorMessage: `Missing dependency: ${dep.type}:${dep.fullName}`,
      type: dep.type,
      fullName: dep.fullName
    });
  });

  // 2. Check file-specific failures
  failures.forEach(f => {
    const errorMsg = f.problem || f.error || f.problemType || '';
    const filePath = f.filePath ? path.resolve(deployDir, f.filePath) : null;
    if (!filePath || !fs.existsSync(filePath)) return;

    if (filePath.endsWith('.xml') || filePath.endsWith('-meta.xml')) {
      diagnostics.push({
        healer: 'xml',
        filePath,
        errorMessage: errorMsg
      });
    } else if (filePath.endsWith('.cls') || filePath.endsWith('.trigger')) {
      diagnostics.push({
        healer: 'llm',
        filePath,
        errorMessage: errorMsg
      });
    }
  });

  if (!diagnostics.length) {
    updateAgentRun(runRecord.id, {
      status: 'failed',
      diagnosticSummary: 'Unable to diagnose any matching errors',
      completedAt: new Date().toISOString()
    });
    return { healed: false, healersApplied: [], filesModified: [], summary: 'No diagnostics generated' };
  }

  // 3. Apply Healers
  let healCount = 0;
  for (const diag of diagnostics) {
    try {
      if (diag.healer === 'dependency' && diag.type && diag.fullName) {
        const result = await healDependency(diag.type, diag.fullName, sourceDir, deployDir);
        if (result.success) {
          healersApplied.push(`dependency:${diag.type}:${diag.fullName}`);
          result.filesModified.forEach(f => filesModified.push(f));
          healCount++;
        }
      } else if (diag.healer === 'xml' && diag.filePath) {
        const result = await healXmlFile(diag.filePath, diag.errorMessage, sourceDir, deployDir);
        if (result.success && result.modified) {
          healersApplied.push(`xml:${path.basename(diag.filePath)}`);
          filesModified.push(path.relative(deployDir, diag.filePath));
          healCount++;
        }
      } else if (diag.healer === 'llm' && diag.filePath) {
        const result = await healWithLlm(diag.filePath, diag.errorMessage, deployDir, tenantId);
        if (result.success && result.modified) {
          healersApplied.push(`llm:${path.basename(diag.filePath)}`);
          filesModified.push(path.relative(deployDir, diag.filePath));
          healCount++;
        }
      }
    } catch (err: any) {
      console.error(`Error in healer execution: ${err.message}`);
    }
  }

  const uniqueHealers = [...new Set(healersApplied)];
  const uniqueFiles = [...new Set(filesModified)];
  const healed = healCount > 0;
  const summary = healed
    ? `Successfully applied ${uniqueHealers.length} healer(s) and modified ${uniqueFiles.length} file(s).`
    : 'No healers could be successfully applied.';

  updateAgentRun(runRecord.id, {
    status: healed ? 'healed' : 'failed',
    diagnosticSummary: summary,
    healersApplied: uniqueHealers,
    filesModified: uniqueFiles,
    completedAt: new Date().toISOString()
  });

  return {
    healed,
    healersApplied: uniqueHealers,
    filesModified: uniqueFiles,
    summary
  };
}
