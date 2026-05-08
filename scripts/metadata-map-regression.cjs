const assert = require('node:assert/strict');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = function registerTs(module, filename) {
  const source = require('fs').readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true
    },
    fileName: filename
  });
  module._compile(transpiled.outputText, filename);
};

const { mapRelPathToMetadata, generateDeltaManifest } = require(path.resolve(__dirname, '../src/lib/metadata.ts'));

const cases = [
  ['tabs/Agent_s_Home.flexipage-meta.xml', { type: 'CustomTab', name: 'Agent_s_Home' }],
  [
    'profileSessionSettings/null_profileSessionSetting1776176868737.profileSessionSetting-meta.xml',
    { type: 'ProfileSessionSetting', name: 'null_profileSessionSetting1776176868737' }
  ],
  [
    'profilePasswordPolicies/MBFS_QA_QC_Profile_profilePasswordPolicy1776176868655.profilePasswordPolicy-meta.xml',
    { type: 'ProfilePasswordPolicy', name: 'MBFS_QA_QC_Profile_profilePasswordPolicy1776176868655' }
  ],
  ['pathAssistants/DCA.pathAssistant-meta.xml', { type: 'PathAssistant', name: 'DCA' }],
  ['flexipages/Account_Record_Page.flexipage-meta.xml', { type: 'FlexiPage', name: 'Account_Record_Page' }],
  ['flowDefinitions/UpdateAcc.flowDefinition-meta.xml', { type: 'FlowDefinition', name: 'UpdateAcc' }],
  ['networks/DCA.network-meta.xml', { type: 'Network', name: 'DCA' }],
  ['externalClientApps/MuleSoft_OAuth_App.eca-meta.xml', { type: 'ExternalClientApplication', name: 'MuleSoft_OAuth_App' }],
  ['settings/Account.settings-meta.xml', { type: 'AccountSettings', name: 'Account' }],
  ['settings/Case.settings-meta.xml', { type: 'CaseSettings', name: 'Case' }],
  ['settings/EmailTemplate.settings-meta.xml', { type: 'EmailTemplateSettings', name: 'EmailTemplate' }],
  ['settings/BusinessHours.settings-meta.xml', { type: 'BusinessHoursSettings', name: 'BusinessHours' }],
  ['mktDataTranObjects/ConsumptionResourceTags_std.mktDataTranObject-meta.xml', { type: 'MktDataTranObject', name: 'ConsumptionResourceTags_std' }],
  ['mktDataSources/CatalogMdloConnectionInstanceConsumptionResourceTags.dataSource-meta.xml', { type: 'DataSource', name: 'CatalogMdloConnectionInstanceConsumptionResourceTags' }],
  ['mktDataConnections/CatalogMdloConnectionInstance.mktDataConnection-meta.xml', { type: 'MktDataConnection', name: 'CatalogMdloConnectionInstance' }],
  ['dataSourceObjects/ConsumptionResourceTags_std_dll.dataSourceObject-meta.xml', { type: 'DataSourceObject', name: 'ConsumptionResourceTags_std_dll' }]
];

for (const [relPath, expected] of cases) {
  assert.deepStrictEqual(mapRelPathToMetadata(relPath), expected, relPath);
}

const manifestPath = path.join('/tmp', `metadata-map-regression-${process.pid}.xml`);
const manifestXml = generateDeltaManifest(manifestPath, [
  {
    type: 'profileSessionSettings',
    name: 'null_profileSessionSetting1776176868737.profileSessionSetting-meta.xml',
    status: 'Added',
    relPath: 'profileSessionSettings/null_profileSessionSetting1776176868737.profileSessionSetting-meta.xml'
  }
]);
assert.match(manifestXml, /<name>ProfileSessionSetting<\/name>/);
assert.doesNotMatch(manifestXml, /<name>profileSessionSettings<\/name>/);

const destructivePath = path.join('/tmp', `metadata-map-regression-destructive-${process.pid}.xml`);
const destructiveXml = generateDeltaManifest(destructivePath, [
  {
    type: 'mktDataTranObjects',
    name: 'ConsumptionResourceTags_std.mktDataTranObject-meta.xml',
    status: 'Added',
    relPath: 'mktDataTranObjects/ConsumptionResourceTags_std.mktDataTranObject-meta.xml'
  }
]);
assert.match(destructiveXml, /<name>MktDataTranObject<\/name>/);
assert.doesNotMatch(destructiveXml, /<name>mktDataTranObjects<\/name>/);

const destructiveFallbackPath = path.join('/tmp', `metadata-map-regression-destructive-fallback-${process.pid}.xml`);
const destructiveFallbackXml = generateDeltaManifest(destructiveFallbackPath, [
  {
    type: 'mktDataTranObjects',
    name: 'ConsumptionResourceTags_std.mktDataTranObject-meta.xml',
    status: 'Added'
  }
]);
assert.match(destructiveFallbackXml, /<name>MktDataTranObject<\/name>/);
assert.doesNotMatch(destructiveFallbackXml, /<name>mktDataTranObjects<\/name>/);

const dataSourceFallbackPath = path.join('/tmp', `metadata-map-regression-datasource-fallback-${process.pid}.xml`);
const dataSourceFallbackXml = generateDeltaManifest(dataSourceFallbackPath, [
  {
    type: 'mktDataSources',
    name: 'CatalogMdloConnectionInstanceConsumptionResourceTags.dataSource-meta.xml',
    status: 'Added'
  }
]);
assert.match(dataSourceFallbackXml, /<name>DataSource<\/name>/);
assert.doesNotMatch(dataSourceFallbackXml, /<name>MktDataSource<\/name>/);
assert.doesNotMatch(dataSourceFallbackXml, /<name>mktDataSources<\/name>/);

const settingsFallbackPath = path.join('/tmp', `metadata-map-regression-settings-${process.pid}.xml`);
const settingsFallbackXml = generateDeltaManifest(settingsFallbackPath, [
  {
    type: 'Settings',
    name: 'Account',
    status: 'Added'
  }
]);
assert.match(settingsFallbackXml, /<name>AccountSettings<\/name>/);
assert.doesNotMatch(settingsFallbackXml, /<name>Settings<\/name>/);

console.log('metadata mapping regression checks passed');
