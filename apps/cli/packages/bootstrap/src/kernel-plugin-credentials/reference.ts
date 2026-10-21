// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials：凭据引用名 ↔ providerId 的双向映射。
//
// 为什么需要一层独立模块：`resolve()` 收的是 DSH 的 `CredentialRef`（POSIX 环境变量名形状），
// `readRecord()` 收的是 `CredentialKey`（`<scope>/<id>` 形状），而本包需要的是 Knorvia 的
// `providerId`。三条命名空间的转换集中在这里，避免散落在 provider 实现里各写一遍。
//
// 引用名规则（冻结，见 interface.md §一 config）：`<prefix><normalizedProviderId>`，
// 其中 `normalizedProviderId` 把非 POSIX 标识符字符折叠成 `_`。

import { credentialKeyScope } from "@deepseek-ai/dsh-credentials";
import type { CredentialKey, CredentialRef } from "@deepseek-ai/dsh-credentials";

/**
 * 把 `providerId` 规范化成可作为 POSIX 环境变量名后缀的形式。
 *
 * POSIX 标识符只允许 `[A-Za-z_][A-Za-z0-9_]*`；providerId 通常含 `-`（如
 * `fixture-openai-completions`），因此 `-` 折叠成 `_`。**大小写保留**——折叠大小写会让
 * `Foo` 与 `foo` 撞名，而它们可能是两个不同的 provider。
 */
export function normalizeProviderIdForRef(providerId: string): string {
  const collapsed = providerId.replace(/[^A-Za-z0-9_]/gu, "_");
  // 首字符不能是数字。
  return /^[0-9]/u.test(collapsed) ? `_${collapsed}` : collapsed;
}

/**
 * 从 `CredentialRef`（环境变量名形状）还原出 `providerId`。
 *
 * @returns `providerId`；引用名不在本 provider 的命名空间（前缀不匹配）时返回 `undefined`。
 */
export function providerIdOfCredentialRef(
  ref: CredentialRef | string,
  prefix: string,
): string | undefined {
  const name = String(ref);
  if (!name.startsWith(prefix)) return undefined;
  const rest = name.slice(prefix.length);
  if (rest.length === 0) return undefined;
  // 规范化是单向的（`-` → `_`），因此这里还原出的是规范化后的形式；
  // 调用方拿它当 providerId 去问 Host 是安全的——Host 侧按规范化形式也能对齐，
  // 因为 `buildPiAiProviderTable` 写 `apiKeyEnv` 时用的就是这个函数。
  return rest;
}

/**
 * 从 `CredentialKey`（`<scope>/<id>`）还原出宿主 providerId。
 *
 * 本包只认 `llm-pi-ai` scope 下的记录（`dsh-llm-pi-ai` 的 `RECORD_SCOPE` 就是它）；
 * 其它 scope 的记录不归本 provider，返回 `undefined`。
 *
 * @param key - DSH 的记录地址。
 * @param expectedScope - 期望的 scope（`"llm-pi-ai"`）。
 * @returns 宿主路由 key（即 providerId）；scope 不匹配时 `undefined`。
 */
export function readRecordProviderId(
  key: CredentialKey,
  expectedScope: string,
): string | undefined {
  if (credentialKeyScope(key) !== expectedScope) return undefined;
  const joined = String(key);
  const slash = joined.indexOf("/");
  if (slash < 0) return undefined;
  const id = joined.slice(slash + 1);
  return id.length === 0 ? undefined : id;
}
