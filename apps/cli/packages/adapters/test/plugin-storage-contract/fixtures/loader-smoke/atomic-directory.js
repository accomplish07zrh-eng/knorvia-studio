// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export { sharedIdentity } from "./shared.js";
export const facadeName = "atomic-directory";

import { writeFile } from "node:fs/promises";

export function recoverAtomicTargetSync(targetPath) {
  return targetPath;
}

export async function writeFileAtomically(path, data) {
  await writeFile(path, data);
}
