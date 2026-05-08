const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const base = process.env.APP_BASE_URL || 'http://127.0.0.1:3001';
const db = new Database('data/app.db');
const secret = process.env.JWT_SECRET || 'dev-secret-key-change-me';
const authUrl = fs
  .readFileSync('environments.md', 'utf8')
  .trim()
  .replace(/^org\s+\d+:\s*/i, '');
const stamp = Date.now();
const email = `apitest.${stamp}@test.local`;
const password = 'InitPass123!';
const resetPassword = 'ResetPass123!';
const changedPassword = 'ChangedPass123!';

const superAdmin = db
  .prepare("select id, email, role, tenant_id as tenantId from users where role = 'super_admin' order by rowid asc limit 1")
  .get();

if (!superAdmin) {
  throw new Error('No super admin user found');
}

const superToken = jwt.sign(superAdmin, secret, { expiresIn: '7d' });

const state = {
  testUserId: null,
  tempAdminUserId: null,
  tempCompanyUserId: null,
  adminTenantId: null,
  dbTenantId: `tenant_dbtest_${stamp}`,
  userToken: null,
  projectId: null,
  projectName: `API Test ${stamp}`,
  srcAlias: `apitestsrc${String(stamp).slice(-6)}`,
  dstAlias: `apitestdst${String(stamp).slice(-6)}`,
  syncComparisonId: null,
  asyncJobId: null
};

const results = [];

function log(name, ok, details = {}) {
  results.push({ name, ok, ...details });
}

async function request(method, urlPath, { token, body, headers = {}, raw = false } = {}) {
  const init = {
    method,
    headers: {
      ...headers
    }
  };
  if (token) {
    init.headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(base + urlPath, init);
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as text
  }
  if (raw) {
    return { status: response.status, data, headers: response.headers, text };
  }
  return { status: response.status, data };
}

function assertStatus(response, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.status)) {
    throw new Error(`${label} expected ${allowed.join('/')} got ${response.status}: ${JSON.stringify(response.data)}`);
  }
  return response.data;
}

function refreshUserRow(userId) {
  return db.prepare('select id, email, role, tenant_id as tenantId from users where id = ?').get(userId);
}

function signToken(row, roleOverride) {
  return jwt.sign(
    {
      id: row.id,
      email: row.email,
      role: roleOverride || row.role,
      tenantId: row.tenantId
    },
    secret,
    { expiresIn: '7d' }
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function walkFirstFile(baseDir) {
  const queue = [baseDir];
  while (queue.length) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['logs', 'manifest', '.sf', '.sfdx', '.git'].includes(entry.name)) continue;
        queue.push(full);
      } else if (entry.isFile() && entry.name !== 'sfdx-project.json') {
        return path.relative(baseDir, full);
      }
    }
  }
  return null;
}

async function poll(pathname, token, predicate, timeoutMs = 240000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await request('GET', pathname, { token });
    if (response.status === 200 && predicate(response.data)) {
      return response.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for ${pathname}`);
}

async function bestEffortCleanup() {
  const cleanupSteps = [];

  if (state.projectId && state.userToken) {
    cleanupSteps.push(
      request('DELETE', `/api/projects/${state.projectId}`, { token: state.userToken, body: {} }).catch(() => null)
    );
  }

  if (state.userToken) {
    cleanupSteps.push(
      request('DELETE', `/api/orgs/${state.srcAlias}`, { token: state.userToken, body: {} }).catch(() => null),
      request('DELETE', `/api/orgs/${state.dstAlias}`, { token: state.userToken, body: {} }).catch(() => null)
    );
  }

  if (state.asyncJobId) {
    cleanupSteps.push(
      request('POST', '/api/company-admin/jobs/clear', {
        token: state.userToken,
        body: { jobId: state.asyncJobId }
      }).catch(() => null)
    );
  }

  if (state.syncComparisonId) {
    cleanupSteps.push(
      request('POST', '/api/admin/jobs/clear', {
        token: superToken,
        body: { jobId: state.syncComparisonId }
      }).catch(() => null)
    );
  }

  if (state.dbTenantId) {
    cleanupSteps.push(
      request('DELETE', '/api/db/row', {
        token: superToken,
        body: { name: 'tenants', id: state.dbTenantId }
      }).catch(() => null)
    );
  }

  if (state.tempCompanyUserId) {
    cleanupSteps.push(
      request('DELETE', '/api/admin/users', {
        token: superToken,
        body: { userId: state.tempCompanyUserId }
      }).catch(() => null)
    );
  }

  if (state.tempAdminUserId) {
    cleanupSteps.push(
      request('DELETE', '/api/admin/users', {
        token: superToken,
        body: { userId: state.tempAdminUserId }
      }).catch(() => null)
    );
  }

  if (state.adminTenantId) {
    cleanupSteps.push(
      request('DELETE', '/api/admin/tenants', {
        token: superToken,
        body: { tenantId: state.adminTenantId }
      }).catch(() => null)
    );
  }

  if (state.testUserId) {
    cleanupSteps.push(
      request('DELETE', '/api/admin/users', {
        token: superToken,
        body: { userId: state.testUserId }
      }).catch(() => null)
    );
  }

  await Promise.all(cleanupSteps);
}

async function run() {
  let userToken = null;
  let companyToken = null;
  let selected = null;
  let sourceLogPath = null;
  let upgradeRequestId = null;

  let response = await request('GET', '/api/services/status');
  assertStatus(response, 200, 'services.status');
  log('services.status', true, { sf: response.data.sf?.status });

  response = await request('GET', '/api/guide');
  assertStatus(response, 200, 'guide');
  log('guide', true, { docName: response.data.name });

  response = await request('GET', '/api/docs/list');
  const docs = assertStatus(response, 200, 'docs.list');
  log('docs.list', true, { count: docs.files.length });

  response = await request('GET', `/api/docs/file?name=${encodeURIComponent(docs.files[0])}`);
  assertStatus(response, 200, 'docs.file');
  log('docs.file', true, { docName: docs.files[0] });

  response = await request('POST', '/api/private-docs/login', { body: { password: 'amit' }, raw: true });
  assertStatus(response, 200, 'private-docs.login');
  const privateCookie = response.headers.get('set-cookie');
  log('private-docs.login', true);

  response = await request('GET', '/api/private-docs/list', { headers: { cookie: privateCookie } });
  const privateDocs = assertStatus(response, 200, 'private-docs.list');
  log('private-docs.list', true, { count: privateDocs.files.length });

  if (privateDocs.files.length) {
    response = await request('GET', `/api/private-docs/file?name=${encodeURIComponent(privateDocs.files[0])}`, {
      headers: { cookie: privateCookie }
    });
    assertStatus(response, 200, 'private-docs.file');
    log('private-docs.file', true, { docName: privateDocs.files[0] });
  }

  response = await request('POST', '/api/private-docs/logout', { headers: { cookie: privateCookie } });
  assertStatus(response, 200, 'private-docs.logout');
  log('private-docs.logout', true);

  response = await request('POST', '/api/auth/register', { body: { email, password } });
  const register = assertStatus(response, 201, 'auth.register');
  userToken = register.token;
  state.userToken = userToken;
  state.testUserId = register.user.id;
  log('auth.register', true, { userId: register.user.id, role: register.user.role });

  response = await request('POST', '/api/auth/login', { body: { email, password } });
  assertStatus(response, 200, 'auth.login');
  log('auth.login', true);

  response = await request('GET', '/api/profile', { token: userToken });
  assertStatus(response, 200, 'profile.get');
  log('profile.get', true);

  response = await request('PATCH', '/api/profile', {
    token: userToken,
    body: {
      name: 'API Test User',
      company: 'QA',
      social: { github: 'https://github.com/example' }
    }
  });
  assertStatus(response, 200, 'profile.patch');
  log('profile.patch', true);

  response = await request('GET', '/api/usage', { token: userToken });
  assertStatus(response, 200, 'usage.get');
  log('usage.get', true, { plan: response.data.plan });

  response = await request('POST', '/api/auth/forgot', { body: { email } });
  assertStatus(response, 200, 'auth.forgot');
  log('auth.forgot', true);

  const resetToken = crypto.randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    `reset_${stamp}`,
    register.user.id,
    sha256(resetToken),
    new Date(Date.now() + 3600_000).toISOString(),
    null,
    new Date().toISOString(),
    null,
    'validate-e2e'
  );
  response = await request('POST', '/api/auth/reset', { body: { token: resetToken, password: resetPassword } });
  assertStatus(response, 200, 'auth.reset');
  log('auth.reset', true);

  response = await request('POST', '/api/auth/login', { body: { email, password: resetPassword } });
  userToken = assertStatus(response, 200, 'auth.login.after-reset').token;
  state.userToken = userToken;
  log('auth.login.after-reset', true);

  response = await request('POST', '/api/profile/password', {
    token: userToken,
    body: { currentPassword: resetPassword, newPassword: changedPassword }
  });
  assertStatus(response, 200, 'profile.password');
  log('profile.password', true);

  response = await request('POST', '/api/auth/login', { body: { email, password: changedPassword } });
  userToken = assertStatus(response, 200, 'auth.login.after-password-change').token;
  state.userToken = userToken;
  log('auth.login.after-password-change', true);

  response = await request('POST', '/api/upgrade/request', { token: userToken, body: { plan: 'pro' } });
  upgradeRequestId = assertStatus(response, 201, 'upgrade.request').request.id;
  log('upgrade.request', true, { requestId: upgradeRequestId });

  response = await request('POST', '/api/orgs', {
    token: userToken,
    body: { alias: state.srcAlias, sfdxAuthUrl: authUrl }
  });
  assertStatus(response, 201, 'orgs.create.source');
  log('orgs.create.source', true, { alias: state.srcAlias });

  response = await request('POST', '/api/orgs', {
    token: userToken,
    body: { alias: state.dstAlias, sfdxAuthUrl: authUrl }
  });
  assertStatus(response, 201, 'orgs.create.destination');
  log('orgs.create.destination', true, { alias: state.dstAlias });

  response = await request('GET', `/api/orgs/${state.srcAlias}`, { token: userToken });
  assertStatus(response, 200, 'orgs.get');
  log('orgs.get', true);

  response = await request('GET', `/api/orgs/${state.srcAlias}/auth`, { token: userToken });
  assertStatus(response, 200, 'orgs.auth');
  log('orgs.auth', true, { prefix: String(response.data.sfdxAuthUrl).slice(0, 8) });

  response = await request('PATCH', `/api/orgs/${state.srcAlias}`, {
    token: userToken,
    body: { alias: state.srcAlias, sfdxAuthUrl: authUrl }
  });
  assertStatus(response, 200, 'orgs.patch');
  log('orgs.patch', true);

  response = await request('POST', '/api/projects', {
    token: userToken,
    body: { name: state.projectName }
  });
  const createdProject = assertStatus(response, 201, 'projects.create');
  state.projectId = createdProject.id;
  log('projects.create', true, { projectId: state.projectId });

  state.projectName = `${state.projectName} Renamed`;
  response = await request('PATCH', `/api/projects/${state.projectId}`, {
    token: userToken,
    body: { name: state.projectName }
  });
  assertStatus(response, 200, 'projects.patch');
  log('projects.patch', true, { projectName: state.projectName });

  response = await request('GET', '/api/projects', { token: userToken });
  assertStatus(response, 200, 'projects.list');
  log('projects.list', true, { count: response.data.length });

  response = await request('POST', `/api/projects/${state.projectId}/orgs`, {
    token: userToken,
    body: { sourceOrg: state.srcAlias, destinationOrg: state.dstAlias }
  });
  assertStatus(response, 200, 'projects.orgs');
  log('projects.orgs', true);

  response = await request('POST', `/api/projects/${state.projectId}/manifests/source/generate`, { token: userToken });
  if (response.status === 200) {
    log('manifests.generate.source', true);
  } else {
    log('manifests.generate.source', false, { status: response.status, message: response.data?.message || String(response.data) });
  }

  response = await request('POST', `/api/projects/${state.projectId}/manifests/destination/generate`, { token: userToken });
  if (response.status === 200) {
    log('manifests.generate.destination', true);
  } else {
    log('manifests.generate.destination', false, { status: response.status, message: response.data?.message || String(response.data) });
  }

  const candidateTypes = ['ApexClass', 'Flow', 'CustomObject', 'PermissionSet', 'Profile'];
  for (const type of candidateTypes) {
    response = await request(
      'GET',
      `/api/projects/${state.projectId}/retrieve/source/members?type=${encodeURIComponent(type)}&refresh=true`,
      { token: userToken }
    );
    if (response.status === 200 && Array.isArray(response.data.members) && response.data.members.length) {
      selected = { type, member: response.data.members[0] };
      log(`retrieve.members.${type}`, true, { picked: selected.member, count: response.data.members.length });
      break;
    }
  }
  if (!selected) {
    throw new Error('No metadata members found for test manifest');
  }

  const manifestXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
    '  <types>',
    `    <members>${selected.member}</members>`,
    `    <name>${selected.type}</name>`,
    '  </types>',
    '  <version>65.0</version>',
    '</Package>'
  ].join('\n');

  response = await request('POST', `/api/projects/${state.projectId}/manifests/source`, {
    token: userToken,
    body: { xml: manifestXml }
  });
  assertStatus(response, 200, 'manifests.save.source');
  log('manifests.save.source', true);

  response = await request('POST', `/api/projects/${state.projectId}/manifests/destination`, {
    token: userToken,
    body: { xml: manifestXml }
  });
  assertStatus(response, 200, 'manifests.save.destination');
  log('manifests.save.destination', true);

  response = await request('GET', `/api/projects/${state.projectId}/manifests`, { token: userToken });
  assertStatus(response, 200, 'manifests.get');
  log('manifests.get', true);

  response = await request('POST', `/api/projects/${state.projectId}/retrieve/source`, {
    token: userToken,
    body: {}
  });
  sourceLogPath = assertStatus(response, 200, 'retrieve.source.start').logPath;
  log('retrieve.source.start', true);

  const sourceStatus = await poll(
    `/api/projects/${state.projectId}/retrieve/source/status`,
    userToken,
    (payload) => payload.done === true
  );
  log('retrieve.source.status', true, {
    failed: sourceStatus.outputs.filter((item) => item.status === 'Failed').length
  });

  response = await request('POST', `/api/projects/${state.projectId}/retrieve/source/stop`, {
    token: userToken,
    body: {}
  });
  assertStatus(response, 200, 'retrieve.source.stop');
  log('retrieve.source.stop', true);

  response = await request('POST', `/api/projects/${state.projectId}/retrieve/destination`, {
    token: userToken,
    body: {}
  });
  assertStatus(response, 200, 'retrieve.destination.start');
  log('retrieve.destination.start', true);

  const destinationStatus = await poll(
    `/api/projects/${state.projectId}/retrieve/destination/status`,
    userToken,
    (payload) => payload.done === true
  );
  log('retrieve.destination.status', true, {
    failed: destinationStatus.outputs.filter((item) => item.status === 'Failed').length
  });

  response = await request('POST', `/api/projects/${state.projectId}/retrieve/destination/stop`, {
    token: userToken,
    body: {}
  });
  assertStatus(response, 200, 'retrieve.destination.stop');
  log('retrieve.destination.stop', true);

  const sourceDir = path.join('userdata', state.testUserId, 'projects', state.projectName, 'source');
  const relPath = walkFirstFile(sourceDir);
  if (!relPath) {
    throw new Error('No retrieved source file found');
  }
  selected.relPath = relPath;

  response = await request(
    'GET',
    `/api/projects/${state.projectId}/files?target=source&relPath=${encodeURIComponent(relPath)}`,
    { token: userToken }
  );
  assertStatus(response, 200, 'files.source');
  log('files.source', true, { relPath });

  response = await request(
    'GET',
    `/api/projects/${state.projectId}/files?target=destination&relPath=${encodeURIComponent(relPath)}&allowMissing=true`,
    { token: userToken }
  );
  assertStatus(response, 200, 'files.destination');
  log('files.destination', true, { missing: Boolean(response.data.missing) });

  response = await request(
    'GET',
    `/api/projects/${state.projectId}/logs?relPath=${encodeURIComponent(sourceLogPath)}`,
    { token: userToken }
  );
  assertStatus(response, 200, 'logs.get');
  log('logs.get', true, { relPath: sourceLogPath });

  response = await request('POST', `/api/projects/${state.projectId}/compare`, {
    token: userToken,
    body: {}
  });
  const compare = assertStatus(response, 200, 'compare.sync');
  state.syncComparisonId = compare.record.id;
  log('compare.sync', true, { changes: compare.changes.length, comparisonId: state.syncComparisonId });

  const deltaChanges = compare.changes.length
    ? compare.changes
    : [{ type: selected.type, name: selected.member, status: 'Changed', relPath: selected.relPath }];
  response = await request('POST', `/api/projects/${state.projectId}/delta`, {
    token: userToken,
    body: { changes: deltaChanges }
  });
  assertStatus(response, 200, 'delta.build');
  log('delta.build', true, { selectionCount: response.data.selectionCount });

  response = await request('POST', `/api/projects/${state.projectId}/deploy`, {
    token: userToken,
    body: { checkOnly: true, testLevel: 'NoTestRun', autoRetry: true }
  });
  const deploy = assertStatus(response, 200, 'deploy');
  log('deploy', true, { status: deploy.result.status, attempts: deploy.result.attempts });

  response = await request('GET', `/api/projects/${state.projectId}/history`, { token: userToken });
  assertStatus(response, 200, 'history.get');
  log('history.get', true);

  response = await request('GET', `/api/projects/${state.projectId}/report?relPath=${encodeURIComponent(compare.reportRelPath)}`, {
    token: userToken,
    raw: true
  });
  assertStatus(response, 200, 'report.get');
  log('report.get', true, { relPath: compare.reportRelPath });

  response = await request('POST', `/api/projects/${state.projectId}/compare/job`, {
    token: userToken,
    body: { manifestStrategy: 'existing' }
  });
  state.asyncJobId = assertStatus(response, 200, 'compare.job.start').jobId;
  log('compare.job.start', true, { jobId: state.asyncJobId });

  const asyncJob = await poll(
    `/api/projects/${state.projectId}/compare/job/${state.asyncJobId}`,
    userToken,
    (payload) => ['done', 'failed', 'canceled'].includes(payload.status)
  );
  log('compare.job.status', true, { status: asyncJob.status });

  response = await request('GET', '/api/admin/health', { token: superToken });
  assertStatus(response, 200, 'admin.health');
  log('admin.health', true, { sf: response.data.sf.status });

  response = await request('GET', '/api/admin/summary', { token: superToken });
  assertStatus(response, 200, 'admin.summary');
  log('admin.summary', true);

  response = await request('GET', '/api/admin/settings', { token: superToken });
  const adminSettings = assertStatus(response, 200, 'admin.settings.get');
  log('admin.settings.get', true);

  response = await request('PATCH', '/api/admin/settings', { token: superToken, body: adminSettings });
  assertStatus(response, 200, 'admin.settings.patch');
  log('admin.settings.patch', true);

  response = await request('GET', '/api/admin/limits', { token: superToken });
  const limits = assertStatus(response, 200, 'admin.limits.get');
  log('admin.limits.get', true);

  response = await request('PATCH', '/api/admin/limits', { token: superToken, body: limits });
  assertStatus(response, 200, 'admin.limits.patch');
  log('admin.limits.patch', true);

  response = await request('GET', '/api/admin/usage', { token: superToken });
  assertStatus(response, 200, 'admin.usage');
  log('admin.usage', true);

  response = await request('GET', '/api/admin/storage', { token: superToken });
  assertStatus(response, 200, 'admin.storage');
  log('admin.storage', true);

  response = await request('GET', '/api/admin/audit?limit=20', { token: superToken });
  assertStatus(response, 200, 'admin.audit');
  log('admin.audit', true, { logs: response.data.logs.length });

  response = await request('GET', '/api/admin/users', { token: superToken });
  assertStatus(response, 200, 'admin.users.get');
  log('admin.users.get', true, { count: response.data.users.length });

  response = await request('GET', '/api/admin/projects', { token: superToken });
  assertStatus(response, 200, 'admin.projects.get');
  log('admin.projects.get', true, { count: response.data.projects.length });

  response = await request('GET', '/api/admin/tenants', { token: superToken });
  assertStatus(response, 200, 'admin.tenants.get');
  log('admin.tenants.get', true, { count: response.data.tenants.length });

  response = await request('POST', '/api/admin/tenants', {
    token: superToken,
    body: { name: `API Tenant ${stamp}`, domain: `apitest-${stamp}.local`, plan: 'free' }
  });
  state.adminTenantId = assertStatus(response, 200, 'admin.tenants.post').tenant.id;
  log('admin.tenants.post', true, { tenantId: state.adminTenantId });

  response = await request('PATCH', '/api/admin/tenants', {
    token: superToken,
    body: { tenantId: state.adminTenantId, plan: 'pro' }
  });
  assertStatus(response, 200, 'admin.tenants.patch');
  log('admin.tenants.patch', true);

  response = await request('POST', '/api/admin/users', {
    token: superToken,
    body: {
      email: `admin.temp.${stamp}@test.local`,
      password: 'AdminTemp123!',
      role: 'user',
      tenantId: state.adminTenantId
    }
  });
  state.tempAdminUserId = assertStatus(response, 201, 'admin.users.post').user.id;
  log('admin.users.post', true, { userId: state.tempAdminUserId });

  response = await request('PUT', '/api/admin/users', {
    token: superToken,
    body: { userId: state.tempAdminUserId, password: 'AdminTemp456!' }
  });
  assertStatus(response, 200, 'admin.users.put');
  log('admin.users.put', true);

  response = await request('PATCH', '/api/admin/users', {
    token: superToken,
    body: { userId: state.testUserId, role: 'company_admin' }
  });
  assertStatus(response, 200, 'admin.users.patch');
  log('admin.users.patch', true, { promotedUserId: state.testUserId });

  const promotedUser = refreshUserRow(state.testUserId);
  companyToken = signToken(promotedUser, 'company_admin');

  response = await request('GET', `/api/admin/feature-flags?tenantId=${encodeURIComponent(promotedUser.tenantId)}`, {
    token: superToken
  });
  assertStatus(response, 200, 'admin.feature-flags.get');
  log('admin.feature-flags.get', true);

  response = await request('POST', '/api/admin/feature-flags', {
    token: superToken,
    body: { tenantId: promotedUser.tenantId, featureKey: 'ai_insights', enabled: true }
  });
  assertStatus(response, 200, 'admin.feature-flags.post');
  log('admin.feature-flags.post', true);

  response = await request('GET', `/api/admin/ai-insights?tenantId=${encodeURIComponent(promotedUser.tenantId)}`, {
    token: superToken
  });
  assertStatus(response, 200, 'admin.ai-insights');
  log('admin.ai-insights', true, { count: response.data.insights.length });

  response = await request('GET', `/api/admin/static-scans?tenantId=${encodeURIComponent(promotedUser.tenantId)}`, {
    token: superToken
  });
  assertStatus(response, 200, 'admin.static-scans');
  log('admin.static-scans', true, { count: response.data.scans.length });

  response = await request('GET', `/api/admin/org-docs?tenantId=${encodeURIComponent(promotedUser.tenantId)}`, {
    token: superToken
  });
  assertStatus(response, 200, 'admin.org-docs');
  log('admin.org-docs', true, { count: response.data.docs.length });

  response = await request('GET', '/api/admin/upgrades', { token: superToken });
  assertStatus(response, 200, 'admin.upgrades.get');
  log('admin.upgrades.get', true, { count: response.data.requests.length });

  response = await request('POST', '/api/admin/upgrades', {
    token: superToken,
    body: { requestId: upgradeRequestId, action: 'approved' }
  });
  assertStatus(response, 200, 'admin.upgrades.post');
  log('admin.upgrades.post', true);

  response = await request('GET', '/api/db/overview', { token: superToken });
  assertStatus(response, 200, 'db.overview');
  log('db.overview', true);

  response = await request('GET', '/api/db/tables', { token: superToken });
  assertStatus(response, 200, 'db.tables');
  log('db.tables', true, { count: response.data.tables.length });

  response = await request('GET', '/api/db/table?name=tenants&limit=5&offset=0', { token: superToken });
  assertStatus(response, 200, 'db.table');
  log('db.table', true, { rows: response.data.rows.length });

  response = await request('POST', '/api/db/row', {
    token: superToken,
    body: {
      name: 'tenants',
      data: {
        id: state.dbTenantId,
        name: 'DB Temp Tenant',
        domain: `db-${stamp}.local`,
        plan: 'free',
        created_at: new Date().toISOString()
      }
    }
  });
  assertStatus(response, 200, 'db.row.post');
  log('db.row.post', true, { tenantId: state.dbTenantId });

  response = await request('PATCH', '/api/db/row', {
    token: superToken,
    body: {
      name: 'tenants',
      id: state.dbTenantId,
      data: { name: 'DB Temp Tenant Updated', plan: 'pro' }
    }
  });
  assertStatus(response, 200, 'db.row.patch');
  log('db.row.patch', true);

  response = await request('GET', '/api/company-admin/summary', { token: companyToken });
  assertStatus(response, 200, 'company.summary');
  log('company.summary', true);

  response = await request('GET', '/api/company-admin/users', { token: companyToken });
  assertStatus(response, 200, 'company.users.get');
  log('company.users.get', true, { count: response.data.users.length });

  response = await request('POST', '/api/company-admin/users', {
    token: companyToken,
    body: {
      email: `tenant.user.${stamp}@test.local`,
      password: 'TenantUser123!',
      role: 'user'
    }
  });
  state.tempCompanyUserId = assertStatus(response, 201, 'company.users.post').user.id;
  log('company.users.post', true, { userId: state.tempCompanyUserId });

  response = await request('PATCH', '/api/company-admin/users', {
    token: companyToken,
    body: {
      userId: state.tempCompanyUserId,
      role: 'company_admin',
      password: 'TenantUser456!'
    }
  });
  assertStatus(response, 200, 'company.users.patch');
  log('company.users.patch', true);

  response = await request('GET', '/api/company-admin/projects', { token: companyToken });
  assertStatus(response, 200, 'company.projects');
  log('company.projects', true, { count: response.data.projects.length });

  response = await request('GET', '/api/company-admin/orgs', { token: companyToken });
  assertStatus(response, 200, 'company.orgs');
  log('company.orgs', true, { count: response.data.orgs.length });

  response = await request('GET', '/api/company-admin/feature-flags', { token: companyToken });
  assertStatus(response, 200, 'company.feature-flags.get');
  log('company.feature-flags.get', true);

  response = await request('POST', '/api/company-admin/feature-flags', {
    token: companyToken,
    body: { featureKey: 'static_scans', enabled: true }
  });
  assertStatus(response, 200, 'company.feature-flags.post');
  log('company.feature-flags.post', true);

  response = await request('GET', '/api/company-admin/ai-insights', { token: companyToken });
  assertStatus(response, 200, 'company.ai-insights');
  log('company.ai-insights', true, { count: response.data.insights.length });

  response = await request('GET', '/api/company-admin/static-scans', { token: companyToken });
  assertStatus(response, 200, 'company.static-scans');
  log('company.static-scans', true, { count: response.data.scans.length });

  response = await request('GET', '/api/company-admin/org-docs', { token: companyToken });
  assertStatus(response, 200, 'company.org-docs');
  log('company.org-docs', true, { count: response.data.docs.length });

  response = await request('GET', '/api/company-admin/jobs', { token: companyToken });
  assertStatus(response, 200, 'company.jobs.get');
  log('company.jobs.get', true, { count: response.data.jobs.length });

  response = await request('POST', '/api/company-admin/jobs/stop', {
    token: companyToken,
    body: { jobId: state.asyncJobId }
  });
  assertStatus(response, 200, 'company.jobs.stop');
  log('company.jobs.stop', true);

  response = await request('POST', '/api/company-admin/jobs/clear', {
    token: companyToken,
    body: { jobId: state.asyncJobId }
  });
  assertStatus(response, 200, 'company.jobs.clear');
  log('company.jobs.clear', true);
  state.asyncJobId = null;

  response = await request('GET', '/api/admin/jobs', { token: superToken });
  assertStatus(response, 200, 'admin.jobs.get');
  log('admin.jobs.get', true, { count: response.data.jobs.length });

  response = await request('POST', '/api/admin/jobs/stop', {
    token: superToken,
    body: { jobId: state.syncComparisonId }
  });
  assertStatus(response, 200, 'admin.jobs.stop');
  log('admin.jobs.stop', true);

  response = await request('POST', '/api/admin/jobs/clear', {
    token: superToken,
    body: { jobId: state.syncComparisonId }
  });
  assertStatus(response, 200, 'admin.jobs.clear');
  log('admin.jobs.clear', true);
  state.syncComparisonId = null;

  response = await request('DELETE', '/api/db/row', {
    token: superToken,
    body: { name: 'tenants', id: state.dbTenantId }
  });
  assertStatus(response, 200, 'db.row.delete');
  log('db.row.delete', true);
  state.dbTenantId = null;

  response = await request('DELETE', `/api/projects/${state.projectId}`, { token: userToken, body: {} });
  assertStatus(response, 200, 'projects.delete');
  log('projects.delete', true);
  state.projectId = null;

  response = await request('DELETE', `/api/orgs/${state.srcAlias}`, { token: userToken, body: {} });
  assertStatus(response, 200, 'orgs.delete.source');
  log('orgs.delete.source', true);

  response = await request('DELETE', `/api/orgs/${state.dstAlias}`, { token: userToken, body: {} });
  assertStatus(response, 200, 'orgs.delete.destination');
  log('orgs.delete.destination', true);

  response = await request('DELETE', '/api/admin/users', {
    token: superToken,
    body: { userId: state.tempAdminUserId }
  });
  assertStatus(response, 200, 'admin.users.delete.temp');
  log('admin.users.delete.temp', true);
  state.tempAdminUserId = null;

  response = await request('DELETE', '/api/admin/users', {
    token: superToken,
    body: { userId: state.tempCompanyUserId }
  });
  assertStatus(response, 200, 'admin.users.delete.company-temp');
  log('admin.users.delete.company-temp', true);
  state.tempCompanyUserId = null;

  response = await request('PUT', '/api/admin/tenants', {
    token: superToken,
    body: { mode: 'cleanup_empty' }
  });
  assertStatus(response, 200, 'admin.tenants.cleanup');
  log('admin.tenants.cleanup', true, { removed: response.data.removed });

  response = await request('DELETE', '/api/admin/tenants', {
    token: superToken,
    body: { tenantId: state.adminTenantId }
  });
  assertStatus(response, 200, 'admin.tenants.delete');
  log('admin.tenants.delete', true);
  state.adminTenantId = null;

  response = await request('DELETE', '/api/admin/users', {
    token: superToken,
    body: { userId: state.testUserId }
  });
  assertStatus(response, 200, 'admin.users.delete.test-user');
  log('admin.users.delete.test-user', true);
  state.testUserId = null;
  state.userToken = null;
}

(async () => {
  try {
    await run();
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (error) {
    log('fatal', false, { message: error instanceof Error ? error.message : String(error) });
    console.log(JSON.stringify({ ok: false, results }, null, 2));
    process.exitCode = 1;
  } finally {
    await bestEffortCleanup();
  }
})();
