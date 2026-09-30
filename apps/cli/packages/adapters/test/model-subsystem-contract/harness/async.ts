// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export async function waitUntil(predicate: () => boolean, budget = 80): Promise<void> {
  for (let index = 0; index < budget; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Condition was not reached before microtask budget expired");
}
