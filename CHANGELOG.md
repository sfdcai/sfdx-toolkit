# Changelog

All notable changes to the SFDX DevOps Toolkit are documented here.

## [0.2.0] - 2026-11-25

### Added
- **5-Tier Dependency Deployment Engine**: Strict dependency ordering across Schema, Record Types, UI Layouts, Automations, Security, and Experience Cloud.
- **Digital Experience Bundle Companion Packaging**: Automatic recursive packaging of `content.json`, `_meta.json`, and `styles.css` for LWR Digital Experiences.
- **AppExchange Package Isolation**: Pre-flight isolation of uninstalled managed package dependencies (`purecloud` / Genesys Cloud).
- **Platform Event Staging Prioritization**: Schema-first staging for Platform Events before dependent Apex Triggers compile.
- **Metadata API EmailFolder Membership**: Automatic inclusion of parent email folders in manifest generation.

### Fixed
- **Multi-Pass Staging Wipe Bug**: Fixed workspace wipe behavior during layered deployment execution passes.
- **Dry-Run Test Level Flag**: Standardized dry-run validation syntax to `sf project deploy start --dry-run --test-level NoTestRun`.
- **DigitalExperienceConfig Metadata Mapping**: Added `digitalExperienceConfigs` and `digitalExperiences` to top-level metadata mappings.

### Security
- Reinforced tenant-isolated staging sandbox paths under `userdata/<userId>/projects/<projectId>/deploy`.
