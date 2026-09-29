// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import {
  HttpClientPortError,
  createHttpClientError,
  isHttpClientPortError,
} from "./http-error.mjs";
import { getWorld, record } from "./state.mjs";

export const KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE = "knorvia-plugins-bundled";
export const KNORVIA_INLINE_PLUGIN_MARKETPLACE = "__knorvia-inline-test__";

export function isOfficialMarketplaceId(id) {
  const configured = getWorld().config?.officialMarketplaceIds;
  const result = Array.isArray(configured)
    ? configured.includes(id)
    : id === KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE;
  record("contracts.isOfficialMarketplaceId", { id, result });
  return result;
}

export { HttpClientPortError, createHttpClientError, isHttpClientPortError };

export const HookEventName = Object.freeze({});
export const HookMatcherConfigSchema = Object.freeze({
  safeParse(value) {
    return { success: true, data: value };
  },
  parse(value) {
    return value;
  },
});
