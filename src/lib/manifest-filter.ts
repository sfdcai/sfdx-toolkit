import { buildPackageXml, normalizeManifestXml } from './metadata';
import { filterUnsupportedMetadataTypes, loadSupportedMetadataTypes } from './deploy';
import { fetchCoverageLookup, filterTypesByCoverage } from './metadata-coverage';

/**
 * Filters a manifest XML against both the local metadata registry AND 
 * the live Salesforce Metadata Coverage API.
 */
export async function filterManifestXmlByRegistry(xml: string) {
  const { supportedTypes, registryPath } = loadSupportedMetadataTypes();
  const normalized = normalizeManifestXml(xml);
  
  // 1. Filter by local registry (and global blacklist)
  const registryFiltered = filterUnsupportedMetadataTypes(normalized.types, supportedTypes);
  
  let finalTypes = registryFiltered.filteredTypes;
  let skippedTypes = [...registryFiltered.skippedTypes];
  let coverageEndpoint = '';

  // 2. Filter by Live Metadata Coverage API (metadataApi channel)
  try {
    const { lookup, endpoint } = await fetchCoverageLookup(normalized.version);
    coverageEndpoint = endpoint;
    const coverageResult = filterTypesByCoverage(finalTypes, lookup, 'metadataApi');
    
    finalTypes = coverageResult.kept;
    coverageResult.removed.forEach(r => {
      skippedTypes.push(`${r.type} (${r.reason})`);
    });
  } catch (error) {
    console.error('Metadata Coverage API fetch failed, falling back to local registry only:', error);
    normalized.warnings.push('Metadata Coverage API check failed. Using local registry only.');
  }

  const filteredXml = buildPackageXml(finalTypes, normalized.version);
  
  return {
    xml: filteredXml,
    skippedTypes,
    warnings: normalized.warnings,
    registryPath,
    coverageEndpoint
  };
}


