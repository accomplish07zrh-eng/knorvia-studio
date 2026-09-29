// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { getWorld, record } from "./state.mjs";

const initial = getWorld();
export const DEFAULT_PLUGIN_MARKETPLACES = Object.freeze([
  ...(initial.config?.defaultPluginMarketplaces ?? []),
]);
export const KNORVIA_PLUGIN_ID_ENV_KEY = "KNORVIA_TEST_PLUGIN_ID";

export function sanitizeKnorviaRuntimeEnv(env) {
  record("shared.sanitizeRuntimeEnv", { keys: Object.keys(env ?? {}).sort() });
  return Object.fromEntries(
    Object.entries(env ?? {}).filter(([, value]) => typeof value === "string"),
  );
}

export function findOfficialMcpReservedHeaders() {
  record("shared.findOfficialMcpReservedHeaders");
  return [];
}
