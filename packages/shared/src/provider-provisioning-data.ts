// SPDX-License-Identifier: Apache-2.0

/*
 * Provider 供给信封的纯数据表：触发来源、凭据范围、回执状态与 Provider 域。
 * schema 构造与凭据键校验在 provider-provisioning.ts。
 */

/** 触发一次供给同步的来源。 */
export const PROVIDER_PROVISIONING_TRIGGERS = [
  "environment-online",
  "personal-config",
  "configured-default",
  "account-settings",
  "credential",
] as const;

/** 允许跨 Environment 传输的凭据类别。 */
export const PROVIDER_PROVISIONING_CREDENTIAL_SCOPES = [
  "oauth-session",
  "account-provider",
] as const;

/** 供给回执的终态。 */
export const PROVIDER_PROVISIONING_RESULT_STATUSES = [
  "applied",
  "already-applied",
  "unsupported",
  "failed",
  "rollback_failed",
] as const;

/** 账号设置里的 Provider 域。 */
export const PROVIDER_PROVISIONING_FAMILY_DOMAINS = ["zai", "bigmodel"] as const;
