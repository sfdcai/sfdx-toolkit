import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { filterUnsupportedMetadataTypes, parseMissingRegistryType, shouldContinueAutoRetry } from './deploy';
import { ensureSfdxProject, generateDeltaManifest, normalizeManifestXml } from './metadata';

test('filterUnsupportedMetadataTypes removes unsupported metadata types and keeps supported ones', () => {
  const supportedTypes = new Set(['ApexClass', 'AccountSettings']);
  const manifestTypes = [
    { name: 'ApexClass', members: ['ExampleClass'] },
    { name: 'UserManagementSettings', members: ['UserManagement'] },
    { name: 'AccountSettings', members: ['Account'] }
  ];

  const result = filterUnsupportedMetadataTypes(manifestTypes, supportedTypes);

  assert.deepEqual(result.filteredTypes, [
    { name: 'ApexClass', members: ['ExampleClass'] },
    { name: 'AccountSettings', members: ['Account'] }
  ]);
  assert.deepEqual(result.skippedTypes, ['UserManagementSettings']);
});

test('filterUnsupportedMetadataTypes leaves manifest untouched when registry is unavailable', () => {
  const manifestTypes = [{ name: 'UserManagementSettings', members: ['UserManagement'] }];

  const result = filterUnsupportedMetadataTypes(manifestTypes, null);

  assert.deepEqual(result.filteredTypes, manifestTypes);
  assert.deepEqual(result.skippedTypes, []);
});

test('filterUnsupportedMetadataTypes keeps decomposed child metadata when parent type is supported', () => {
  const supportedTypes = new Set(['ApexClass', 'CustomObject']);
  const manifestTypes = [
    { name: 'CustomField', members: ['Account.Custom_Flag__c'] },
    { name: 'RecordType', members: ['Case.Support'] },
    { name: 'ApexClass', members: ['ExampleClass'] },
    { name: 'UnknownType', members: ['Example'] }
  ];

  const result = filterUnsupportedMetadataTypes(manifestTypes, supportedTypes);

  assert.deepEqual(result.filteredTypes, [
    { name: 'CustomField', members: ['Account.Custom_Flag__c'] },
    { name: 'RecordType', members: ['Case.Support'] },
    { name: 'ApexClass', members: ['ExampleClass'] }
  ]);
  assert.deepEqual(result.skippedTypes, ['UnknownType']);
});

test('ensureSfdxProject normalizes legacy force-app package directories to the project root', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfdx-project-'));
  const projectFile = path.join(rootDir, 'sfdx-project.json');

  fs.writeFileSync(
    projectFile,
    JSON.stringify(
      {
        packageDirectories: [{ path: 'force-app', default: true }],
        sourceApiVersion: '65.0'
      },
      null,
      2
    ),
    'utf8'
  );

  ensureSfdxProject(rootDir, '66.0');

  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  assert.deepEqual(project.packageDirectories, [{ path: '.', default: true }]);
  assert.equal(project.sourceApiVersion, '66.0');
});

test('parseMissingRegistryType extracts missing registry metadata type from sf deploy errors', () => {
  const missing = parseMissingRegistryType({
    name: 'RegistryError',
    message: "Missing metadata type definition in registry for id 'UserManagementSettings'."
  });

  assert.equal(missing, 'UserManagementSettings');
});

test('shouldContinueAutoRetry stops when max attempts reached or failures repeat', () => {
  assert.equal(shouldContinueAutoRetry(true, 1, ['ApexClass:Example'], []), true);
  assert.equal(shouldContinueAutoRetry(true, 3, ['ApexClass:Example'], []), false);
  assert.equal(shouldContinueAutoRetry(true, 2, ['ApexClass:Example'], [], 2), false);
  assert.equal(
    shouldContinueAutoRetry(true, 2, ['ApexClass:Example'], ['ApexClass:Example']),
    false
  );
  assert.equal(shouldContinueAutoRetry(false, 1, ['ApexClass:Example'], []), false);
  assert.equal(shouldContinueAutoRetry(true, 1, [], []), false);
});

test('generateDeltaManifest preserves dotted metadata member names for object children', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delta-manifest-'));
  const manifestPath = path.join(rootDir, 'package.xml');

  const xml = generateDeltaManifest(manifestPath, [
    { type: 'CustomField', name: 'Task.IsVisibleInSelfService', status: 'Added' },
    { type: 'RecordType', name: 'Case.Call_Task', status: 'Added' },
    { type: 'CompactLayout', name: 'Task.Task_Compact_Layout', status: 'Added' }
  ]);

  assert.match(xml, /<members>Task\.IsVisibleInSelfService<\/members>/);
  assert.match(xml, /<members>Case\.Call_Task<\/members>/);
  assert.match(xml, /<members>Task\.Task_Compact_Layout<\/members>/);
  assert.ok(!xml.includes('<members>Case</members>'));
  assert.ok(!xml.includes('<members>Task</members>'));
});

test('normalizeManifestXml deduplicates members and keeps wildcard precedence', () => {
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>Account.Name</members>
    <members>Account.Name</members>
    <members>*</members>
    <name>CustomField</name>
  </types>
  <types>
    <members>Lead.Source</members>
    <name>CustomField</name>
  </types>
  <version>64.0</version>
</Package>`;

  const normalized = normalizeManifestXml(manifest);

  assert.equal(normalized.version, '64.0');
  assert.match(normalized.xml, /<name>CustomField<\/name>/);
  assert.match(normalized.xml, /<members>\*<\/members>/);
  assert.ok(!normalized.xml.includes('<members>Lead.Source</members>'));
});

test('normalizeManifestXml throws when no valid metadata types exist', () => {
  assert.throws(() => normalizeManifestXml('<Package><version>65.0</version></Package>'), /does not contain any valid metadata types/i);
});
