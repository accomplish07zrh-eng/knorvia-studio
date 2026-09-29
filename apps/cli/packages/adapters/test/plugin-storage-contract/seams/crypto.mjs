// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import * as nativeCrypto from "node:crypto";
import { getWorld, record } from "./state.mjs";

export const createHash = nativeCrypto.createHash;

export function randomUUID() {
  const world = getWorld();
  const value =
    world.scripts?.uuid?.shift() ??
    `00000000-0000-4000-8000-${String(world.counters.uuid++).padStart(12, "0")}`;
  record("crypto.randomUUID", { value });
  return value;
}

export default { createHash, randomUUID };
