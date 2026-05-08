import { buildPackageXml, parseManifestComponents } from './metadata';
import { filterUnsupportedMetadataTypes, loadSupportedMetadataTypes } from './deploy';

export function filterManifestXmlByRegistry(xml: string) {
  const { supportedTypes, registryPath } = loadSupportedMetadataTypes();
  const parsed = parseManifestComponents(xml);
  const filtered = filterUnsupportedMetadataTypes(parsed, supportedTypes);
  const filteredXml = buildPackageXml(filtered.filteredTypes);
  return {
    xml: filteredXml,
    skippedTypes: filtered.skippedTypes,
    registryPath
  };
}
