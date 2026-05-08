export type ErrorHelp = {
  title: string;
  message: string;
  actions: string[];
  category:
    | 'auth'
    | 'org'
    | 'manifest'
    | 'retrieve'
    | 'compare'
    | 'deploy'
    | 'environment'
    | 'validation'
    | 'unknown';
};

function lower(value: string) {
  return String(value || '').toLowerCase();
}

export function translateError(input: unknown): ErrorHelp {
  const raw = typeof input === 'string' ? input : input instanceof Error ? input.message : JSON.stringify(input || {});
  const text = lower(raw);

  if (text.includes('session expired') || text.includes('unauthorized') || text.includes('jwt')) {
    return {
      title: 'Sign in again',
      message: 'Your login session is missing or expired.',
      actions: ['Sign in again', 'If this repeats, clear browser session storage and retry'],
      category: 'auth'
    };
  }

  if (text.includes('sfdxauthurl') || text.includes('org authentication failed') || text.includes('login failed')) {
    return {
      title: 'Org authentication failed',
      message: 'The org could not be authenticated with the provided auth URL.',
      actions: [
        'Generate a fresh sfdxAuthUrl from Salesforce CLI',
        'Confirm the alias is correct',
        'Re-save the org from Project & Orgs'
      ],
      category: 'org'
    };
  }

  if (text.includes('sf cli') || text.includes('cli not found') || text.includes('enoent') || text.includes('/sf/bin/sf')) {
    return {
      title: 'Salesforce CLI is unavailable',
      message: 'The app could not execute the Salesforce CLI from the configured path.',
      actions: [
        'Confirm the sf binary is installed on the server',
        'Verify SF_CLI_PATH points to the correct executable',
        'Rebuild or restart the app after fixing the environment'
      ],
      category: 'environment'
    };
  }

  if (text.includes('manifest generation failed') || text.includes('manifest') && text.includes('did not produce')) {
    return {
      title: 'Manifest problem',
      message: 'The manifest is missing, invalid, or could not be generated from the org.',
      actions: [
        'Open Manifests and regenerate from the bound org',
        'Check that the org is still authenticated',
        'Reduce scope if the manifest is too broad'
      ],
      category: 'manifest'
    };
  }

  if (text.includes('retrieve') && (text.includes('failed') || text.includes('error'))) {
    return {
      title: 'Retrieve failed',
      message: 'The metadata retrieve did not complete for one or more types.',
      actions: [
        'Inspect the failed type in Retrieve',
        'Check the CLI Console for the specific metadata type',
        'Reduce manifest scope and retry'
      ],
      category: 'retrieve'
    };
  }

  if (text.includes('comparison') || text.includes('compare')) {
    return {
      title: 'Comparison could not complete',
      message: 'The app could not finish the comparison job with the current workspace inputs.',
      actions: [
        'Confirm source and destination orgs are bound',
        'Make sure both retrieves completed',
        'Retry from Orchestrator or Diff after reviewing readiness panels'
      ],
      category: 'compare'
    };
  }

  if (text.includes('deploy') || text.includes('componentfailures') || text.includes('test level') || text.includes('post-destructive')) {
    return {
      title: 'Deployment failed',
      message: 'Salesforce rejected the deployment package or test configuration.',
      actions: [
        'Review failed components in deploy output',
        'Switch to check-only if you need validation first',
        'Retry without failed components only after reviewing what will be excluded'
      ],
      category: 'deploy'
    };
  }

  if (text.includes('required') || text.includes('invalid') || text.includes('limit reached')) {
    return {
      title: 'Input or policy validation failed',
      message: 'The request is blocked by missing input, invalid format, or a tenant limit.',
      actions: [
        'Read the validation message carefully',
        'Check the current section guide for required inputs',
        'If this is a limit issue, use admin settings or reduce scope'
      ],
      category: 'validation'
    };
  }

  return {
    title: 'Action failed',
    message: raw || 'The operation failed for an unknown reason.',
    actions: ['Review the CLI Console', 'Retry after checking readiness panels', 'Escalate with the exact error text if the issue persists'],
    category: 'unknown'
  };
}
