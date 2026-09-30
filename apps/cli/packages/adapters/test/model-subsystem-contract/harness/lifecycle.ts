// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { TestContext } from "node:test";
import { createSeamState, installSeams, removeSeams } from "./seams.js";
import type { SeamState } from "./seams.js";

export function useSeams(context: TestContext): SeamState {
  const state = createSeamState();
  installSeams(state);
  context.after(async () => {
    await settleOwnedWork(state);
    state.clock.reset();
    removeSeams(state);
  });
  return state;
}

export async function settleOwnedWork(state: SeamState): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  await state.fs.drain();
}
