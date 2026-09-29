// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { atomicCases } from "./atomic.mjs";
import { gitContractCases } from "./git-contract.mjs";
import { installationCases } from "./installation.mjs";
import { manifestDecoderCases } from "./manifest-decoder.mjs";
import { marketplaceSourceCases } from "./marketplace-source.mjs";
import { pureCases } from "./pure.mjs";
import { stateOfficialCases } from "./state-official.mjs";
import { zipArchiveCases } from "./zip-archive.mjs";
import { v5UninstallCases } from "./v5-uninstall.mjs";
import { v5MarketplaceMaterializationCases } from "./v5-marketplace-materialization.mjs";
import { v5InstallManifestCases } from "./v5-install-manifest.mjs";
import { v5DiagnosticCases } from "./v5-diagnostics.mjs";

export const cases = Object.freeze(
  [
    ...pureCases,
    ...stateOfficialCases,
    ...atomicCases,
    ...gitContractCases,
    ...zipArchiveCases,
    ...marketplaceSourceCases,
    ...installationCases,
    ...manifestDecoderCases,
    ...v5UninstallCases,
    ...v5MarketplaceMaterializationCases,
    ...v5InstallManifestCases,
    ...v5DiagnosticCases,
  ].sort((left, right) => left.id.localeCompare(right.id)),
);

export const casesById = new Map();
for (const testCase of cases) {
  if (casesById.has(testCase.id)) {
    throw new Error(`Duplicate test case id ${testCase.id}`);
  }
  casesById.set(testCase.id, testCase);
}
