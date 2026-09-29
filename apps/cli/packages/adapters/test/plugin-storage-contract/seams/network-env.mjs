// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { record } from "./state.mjs";

export function applyNetworkEgressEnv(env, options) {
  record("network.applyEgressEnv", {
    envKeys: Object.keys(env ?? {}).sort(),
    options,
  });
  return { ...env };
}
