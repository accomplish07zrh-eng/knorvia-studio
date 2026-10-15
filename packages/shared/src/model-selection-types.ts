// SPDX-License-Identifier: Apache-2.0
// 模型选择的常量与 UI 结果类型（B28 词表）。

const PROVIDER_NOT_READY_TEXTS = {
  code: "KNORVIA_AGENT_PROVIDER_NOT_READY",
  reason: "provider_not_ready",
} as const;

export const KNORVIA_AGENT_PROVIDER_NOT_READY_CODE = PROVIDER_NOT_READY_TEXTS.code;
export const KNORVIA_AGENT_PROVIDER_NOT_READY_REASON = PROVIDER_NOT_READY_TEXTS.reason;

const GHOST_REASON_TABLE = {
  mismatch: true,
  "no-preference": true,
  "providers-not-ready": true,
  "unresolved-config": true,
} as const;
export type ModelSelectionGhostReason = keyof typeof GHOST_REASON_TABLE;

const UI_ERROR_CODE_TABLE = {
  CONFIG_READ_FAILED: true,
  CONFIG_PARSE_FAILED: true,
  CONFIG_INVALID_SCHEMA: true,
  CONFIG_REQUIRED_FIELD_MISSING: true,
} as const;
export type ModelSelectionUiErrorCode = keyof typeof UI_ERROR_CODE_TABLE;

export type ModelSelectionUiError = {
  code: /* UI 错误码 */ ModelSelectionUiErrorCode;
  i18nKey: /* 展示文案键 */ string;
  detail?: /* 补充细节 */ string;
};

export type ModelSelectionResolution = {
  selectedSupplierKey: /* 最终选中的供应商 key */ string;
  selectedModel: /* 选中的模型 ID */ string | null;
  isGhostSupplier: /* 是否落到了 ghost 供应商 */ boolean;
  supplierMismatchReason: /* ghost 原因 */ ModelSelectionGhostReason | null;
  uiError: /* 配置读取/解析错误 */ ModelSelectionUiError | null;
  shouldClearLocalPreference: /* 是否应清除本地偏好 */ boolean;
};
