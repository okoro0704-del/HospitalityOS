/**
 * HospitalityOS install manifest (repo root entry for LifeOS Portal / Distributor tooling).
 * Source of truth: `@hospitalityos/shared` → `packages/shared/src/manifest/hospitalityos.manifest.ts`
 */
export {
  HOSPITALITYOS_MANIFEST,
  HOSPITALITYOS_DEFAULT_SEED,
  HOSPITALITYOS_DEFAULT_MODULES,
  HOSPITALITYOS_OPTIONAL_MODULES,
  SUITE_VERTICAL_MODULES,
  SUITE_SHARED_MODULES,
  HOSPITALITYOS_INSTALL_TEMPLATES,
  expandSuiteToInternal,
  normalizeSuiteModules,
  folioChargeEnabled,
  posSettlementMethods,
  type HospitalityOsManifest,
  type HospitalityOsDefaultSeed,
  type RequiredLifeOsPrimitive,
  type SuiteModuleId,
  type HospitalityInstallTemplate,
} from "./packages/shared/src/manifest/hospitalityos.manifest.ts";

export { HOSPITALITYOS_MANIFEST as default } from "./packages/shared/src/manifest/hospitalityos.manifest.ts";
