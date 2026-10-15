// SPDX-License-Identifier: Apache-2.0
// 自定义模型值编解码：`custom:` 前缀 + URI 编码载荷（B26）。
const CUSTOM_PREFIX_TEXT = "custom:";

export const CUSTOM_MODEL_VALUE_PREFIX = CUSTOM_PREFIX_TEXT;

export type DecodedCustomModelValue = {
  providerId: /* 解码后的供应商标识 */ string;
  modelName?: /* 解码后的模型名；旧形态可缺席 */ string;
};

function safeDecodeUriComponent(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded; // 编码非法时原样带回，不抛错
  }
}

/** 把「前缀段 + 载荷段」按冒号拼成 custom: 值。 */
function composeCustomValue(chunks: readonly string[]): string {
  return chunks.join(":");
}

export function encodeCustomModelValue(providerInput: string, modelInput?: string): string {
  const chunks = [CUSTOM_MODEL_VALUE_PREFIX + encodeURIComponent(providerInput)];
  if (modelInput) {
    chunks.push(encodeURIComponent(modelInput));
  }
  return composeCustomValue(chunks);
}

// 旧 builtin 形态：builtin:<厂商>:<模型>，冒号可能出现在模型名里，末段整体当模型名。
const LEGACY_BUILTIN_PATTERN = /^builtin:([^:]*):([\s\S]*)$/u;
const PROVIDER_MODEL_PATTERN = /^([^:]*):([\s\S]*)$/u;

type PayloadProbe = (payload: string) => DecodedCustomModelValue | null;

function probeLegacyBuiltin(payload: string): DecodedCustomModelValue | null {
  const matched = LEGACY_BUILTIN_PATTERN.exec(payload);
  if (!matched) {
    return null;
  }
  return {
    providerId: `builtin:${matched[1]!}`,
    modelName: safeDecodeUriComponent(matched[2]!),
  };
}

function probeProviderModel(payload: string): DecodedCustomModelValue | null {
  const matched = PROVIDER_MODEL_PATTERN.exec(payload);
  if (!matched) {
    return null;
  }
  return {
    providerId: safeDecodeUriComponent(matched[1]!),
    modelName: safeDecodeUriComponent(matched[2]!),
  };
}

// 探测顺序即旧判定顺序：先 legacy builtin，再 provider:model。
const PAYLOAD_PROBES: readonly PayloadProbe[] = [probeLegacyBuiltin, probeProviderModel];

export function decodeCustomModelValue(rawValue: string): DecodedCustomModelValue | null {
  if (!rawValue.startsWith(CUSTOM_MODEL_VALUE_PREFIX)) {
    return null; // 非 custom: 前缀一律不算自定义模型值
  }

  const payload = rawValue.slice(CUSTOM_MODEL_VALUE_PREFIX.length);
  for (const probe of PAYLOAD_PROBES) {
    const hit = probe(payload);
    if (hit !== null) {
      return hit;
    }
  }
  return { providerId: safeDecodeUriComponent(payload) };
}
