// SPDX-License-Identifier: Apache-2.0
// 供应商 key 构造：native:/custom:/ghost: 三前缀与 ghost 身份摘要（B27）。
import type { ModelSelectionGhostReason } from "./model-selection-types.js";
import { decodeCustomModelValue } from "./custom-model-value.js";
import type { KnorviaProvider } from "./task-types-core.js";

const SUPPLIER_KEY_PREFIXES = {
  native: "native:",
  custom: "custom:",
  ghost: "ghost:",
} as const;

export const NATIVE_SUPPLIER_KEY_PREFIX = SUPPLIER_KEY_PREFIXES.native;
export const CUSTOM_SUPPLIER_KEY_PREFIX = SUPPLIER_KEY_PREFIXES.custom;
export const GHOST_SUPPLIER_KEY_PREFIX = SUPPLIER_KEY_PREFIXES.ghost;

const TRAILING_SLASHES_PATTERN = /\/+$/;
const MAX_ENCODED_GHOST_IDENTITY_LENGTH = 160; // ghost 身份编码后的长度上限（逐字冻结）

/** FNV-1a 32 位散列；两个不同种子拼出 12 位稳定摘要。 */
function fnv1a32(hashText: string, seed = 0x811c9dc5): number {
  let state = seed >>> 0;
  const glyphs = [...hashText];
  for (let cursor = 0; cursor < glyphs.length; cursor += 1) {
    state ^= glyphs[cursor]!.codePointAt(0) ?? 0;
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return state;
}

function hash12(hashText: string): string {
  const highHalf = fnv1a32(hashText, 0x811c9dc5).toString(16).padStart(8, "0");
  const lowHalf = fnv1a32(hashText, 0x9e3779b1).toString(16).padStart(8, "0");
  const combined = `${highHalf}${lowHalf}`;
  return combined.slice(0, 12);
}

export function normalizeSupplierBaseUrl(rawBaseUrl: string): string {
  return rawBaseUrl.trim().replace(TRAILING_SLASHES_PATTERN, "");
}

/** 前缀 + 载荷的统一拼键口。 */
function joinSupplierKey(kind: keyof typeof SUPPLIER_KEY_PREFIXES, body: string): string {
  return `${SUPPLIER_KEY_PREFIXES[kind]}${body}`;
}

export function buildNativeSupplierKey(providerToken: KnorviaProvider): string {
  return joinSupplierKey("native", providerToken);
}

export function buildCustomSupplierKey(providerInput: string): string {
  return joinSupplierKey("custom", providerInput.trim());
}

export function buildGhostSupplierIdentity(identityText: string): string {
  const encodedIdentity = encodeURIComponent(identityText.trim() || "unknown");
  const fitsInline = encodedIdentity.length <= MAX_ENCODED_GHOST_IDENTITY_LENGTH;
  // ghost 身份可能是一条长 URL：整段塞进 key 会放大状态串、污染日志，
  // 所以超长身份换成稳定摘要，selectedSupplierKey 长度才有上界。
  return fitsInline ? encodedIdentity : `hash=${hash12(identityText)}`;
}

export function buildGhostSupplierKey(
  providerToken: KnorviaProvider,
  reason: ModelSelectionGhostReason,
  identityText: string,
): string {
  const identity = buildGhostSupplierIdentity(identityText);
  return joinSupplierKey("ghost", `${providerToken}:${reason}:${identity}`);
}

export function resolveSupplierKeyFromModelDisplayValue(
  providerToken: KnorviaProvider,
  displayValue: string | boolean | undefined,
): string {
  const decodedModel = decodeCustomModelValue(String(displayValue ?? ""));
  const customTarget = decodedModel?.providerId;
  return customTarget
    ? buildCustomSupplierKey(customTarget)
    : buildNativeSupplierKey(providerToken);
}
