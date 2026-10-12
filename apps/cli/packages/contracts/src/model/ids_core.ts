// SPDX-License-Identifier: Apache-2.0
// 模型身份工厂：把外部字符串收成带品牌的 provider id 与 model id。
// 本文件由 model/index.ts 的运行时声明拆出；模型面类型仍从 ./index.js 导出。

import type { ModelId, ModelProviderId } from "./index.js";
import { ModelProtocolError } from "./protocol-error_core.js";
import { ModelErrorCode } from "./runtime-tables_core.js";

/** 身份串一律先 trim；空串视为非法选择，直接抛协议错误。 */
function requireNonEmptyIdentity(rawValue: string, emptyMessage: string): string {
  const trimmed = rawValue.trim();
  if (trimmed.length > 0) return trimmed;
  throw new ModelProtocolError(ModelErrorCode.InvalidModelSelection, emptyMessage);
}

/** 规范化并校验 provider id。 */
export function createModelProviderId(providerId: string): ModelProviderId {
  return requireNonEmptyIdentity(providerId, "Model provider id is empty") as ModelProviderId;
}

/** 规范化并校验 model id。 */
export function createModelId(modelId: string): ModelId {
  return requireNonEmptyIdentity(modelId, "Model id is empty") as ModelId;
}
