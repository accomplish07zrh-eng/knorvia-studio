// SPDX-License-Identifier: Apache-2.0
export type { ServiceAuthorityMode } from "./internal-s04/service-authority.js";

export {
  isServiceAuthorityMode,
  parseServiceAuthorityMode,
  SERVICE_AUTHORITY_MODE_ENV,
  serviceAuthorityModes,
  shouldUseProviderRegistrySourceForAuthorityMode,
} from "./internal-s04/service-authority.js";
