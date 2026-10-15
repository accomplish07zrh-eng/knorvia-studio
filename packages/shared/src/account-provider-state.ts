// SPDX-License-Identifier: Apache-2.0
// 账号 provider 不可用原因：与严格协议共用的四值枚举（B32）。
import { z } from "zod";

// 原因随 Account State 发送，必须与严格协议共用枚举，避免整份快照被拒绝；
// credential-failed 只表示凭据获取/校验失败，不能据此断言 OAuth 已失效。
const UNAVAILABLE_REASON_TABLE = {
  "not-authenticated": true,
  "not-connected": true,
  "credential-failed": true,
  "not-entitled": true,
} as const;

export type AccountProviderUnavailableReason = keyof typeof UNAVAILABLE_REASON_TABLE;

const REASON_VALUES = Object.keys(UNAVAILABLE_REASON_TABLE) as [
  AccountProviderUnavailableReason,
  ...AccountProviderUnavailableReason[],
];

export const accountProviderUnavailableReasonSchema = z.enum(REASON_VALUES);
