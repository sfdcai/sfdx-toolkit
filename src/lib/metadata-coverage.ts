import { apiVersion } from './config';

export const COVERAGE_CHANNELS = ['metadataApi', 'sourceTracking', 'unlockedPackage', 'managedPackage'] as const;
export type CoverageChannel = (typeof COVERAGE_CHANNELS)[number];

type CoverageEntry = Record<string, unknown> & {
  name?: string;
  metadataApi?: boolean;
  sourceTracking?: boolean;
  unlockedPackage?: boolean;
  managedPackage?: boolean;
};

export function normalizeCoverageLookup(raw: unknown) {
  const lookup = new Map<string, CoverageEntry>();
  if (!raw || typeof raw !== 'object') return lookup;

  const root = raw as Record<string, unknown>;
  const types = root.types;
  if (Array.isArray(types)) {
    types.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const entry = item as CoverageEntry;
      const name = typeof entry.name === 'string' ? entry.name : '';
      if (name) lookup.set(name, entry);
    });
  } else if (types && typeof types === 'object') {
    Object.entries(types as Record<string, unknown>).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      const entry = value as CoverageEntry;
      if (!entry.name) entry.name = key;
      lookup.set(key, entry);
    });
  }

  if (lookup.size) return lookup;

  Object.entries(root).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;
    const entry = value as CoverageEntry;
    const hasChannel = COVERAGE_CHANNELS.some((channel) => typeof entry[channel] === 'boolean');
    if (!hasChannel) return;
    if (!entry.name) entry.name = key;
    lookup.set(key, entry);
  });

  return lookup;
}

export async function fetchCoverageLookup(version = apiVersion) {
  const endpoint = `https://mdcoverage.secure.force.com/services/apexrest/report?version=${encodeURIComponent(version)}`;
  const response = await fetch(endpoint, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Coverage fetch failed with status ${response.status}`);
  }
  const json = await response.json();
  const lookup = normalizeCoverageLookup(json);
  if (!lookup.size) throw new Error('Coverage report did not include metadata types.');
  return { lookup, endpoint };
}

export function filterTypesByCoverage(
  types: { name: string; members: string[] }[],
  lookup: Map<string, CoverageEntry>,
  channel: CoverageChannel
) {
  const kept: { name: string; members: string[] }[] = [];
  const removed: { type: string; reason: string }[] = [];

  types.forEach((item) => {
    const entry = lookup.get(item.name);
    if (!entry) {
      removed.push({ type: item.name, reason: `Type '${item.name}' not found in coverage report` });
      return;
    }
    if (entry[channel] === true) {
      kept.push(item);
      return;
    }
    removed.push({ type: item.name, reason: `Type '${item.name}' is not supported in '${channel}'` });
  });

  return { kept, removed };
}
