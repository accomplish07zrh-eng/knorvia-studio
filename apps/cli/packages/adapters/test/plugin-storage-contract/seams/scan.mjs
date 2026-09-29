// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { getWorld, record } from "./state.mjs";

export function scanSkillFilesUnderRootSync(rootPath) {
  record("scan.skills", { rootPath });
  return getWorld().config?.skillRoots ?? [];
}
