import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { buildPackageXml, normalizeManifestXml, parseManifestComponents } from '@/lib/metadata';
import { filterUnsupportedMetadataTypes, loadSupportedMetadataTypes } from '@/lib/deploy';
import { COVERAGE_CHANNELS, type CoverageChannel, fetchCoverageLookup, filterTypesByCoverage } from '@/lib/metadata-coverage';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const xml = typeof body?.xml === 'string' ? body.xml : '';
  const filterUnsupported = body?.filterUnsupported !== false;
  const channel = typeof body?.channel === 'string' && COVERAGE_CHANNELS.includes(body.channel as CoverageChannel)
    ? (body.channel as CoverageChannel)
    : null;
  const targetVersion = typeof body?.version === 'string' && body.version.trim() ? body.version.trim() : undefined;
  if (!xml.trim()) {
    return NextResponse.json({ message: 'Manifest xml is required' }, { status: 400 });
  }

  try {
    const normalized = normalizeManifestXml(xml);
    let responseXml = normalized.xml;
    let skippedTypes: string[] = [];
    let registryPath: string | null = null;
    let coverageEndpoint: string | null = null;
    const removedByCoverage: { type: string; reason: string }[] = [];

    if (channel) {
      const { lookup, endpoint } = await fetchCoverageLookup(targetVersion || normalized.version);
      coverageEndpoint = endpoint;
      const coverageFiltered = filterTypesByCoverage(parseManifestComponents(responseXml), lookup, channel);
      responseXml = buildPackageXml(coverageFiltered.kept, normalized.version);
      coverageFiltered.removed.forEach((item) => removedByCoverage.push(item));
      if (removedByCoverage.length) {
        normalized.warnings.push(
          `Removed ${removedByCoverage.length} type(s) unsupported for channel '${channel}'.`
        );
      }
    }

    if (filterUnsupported) {
      const { supportedTypes, registryPath: activeRegistryPath } = loadSupportedMetadataTypes();
      registryPath = activeRegistryPath;
      const filtered = filterUnsupportedMetadataTypes(parseManifestComponents(responseXml), supportedTypes);
      skippedTypes = filtered.skippedTypes;
      responseXml = buildPackageXml(filtered.filteredTypes, normalized.version);
      if (skippedTypes.length) {
        normalized.warnings.push(`Filtered unsupported metadata types: ${skippedTypes.join(', ')}`);
      }
    }

    return NextResponse.json({
      message: 'Manifest validated',
      xml: responseXml,
      types: parseManifestComponents(responseXml),
      version: normalized.version,
      warnings: normalized.warnings,
      skippedTypes,
      registryPath,
      channel,
      coverageEndpoint,
      removedByCoverage
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Manifest validation failed';
    return NextResponse.json({ message }, { status: 400 });
  }
}
