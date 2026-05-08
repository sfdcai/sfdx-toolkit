import { claimNextJob, updateJob } from './store';
import { runCompareJob } from './compare-runner';

let runnerStarted = false;
let jobInFlight = false;

export function ensureJobRunner() {
  if (runnerStarted) return;
  runnerStarted = true;
  setInterval(async () => {
    if (jobInFlight) return;
    const next = claimNextJob('compare');
    if (!next) return;
    jobInFlight = true;
    const startedAt = new Date().toISOString();
    updateJob(next.id, { status: 'running', startedAt, updatedAt: startedAt });
    try {
      await runCompareJob(next);
      const completedAt = new Date().toISOString();
      updateJob(next.id, { status: 'done', completedAt, updatedAt: completedAt });
    } catch (err: any) {
      const completedAt = new Date().toISOString();
      updateJob(next.id, {
        status: 'failed',
        completedAt,
        updatedAt: completedAt,
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      jobInFlight = false;
    }
  }, 2000);
}
