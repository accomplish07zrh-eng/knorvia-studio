// SPDX-License-Identifier: Apache-2.0
// 模型身份工厂：provider id 与 model id 的构造与校验。
// 本文件由 model/index.ts 的运行时声明拆出；模型面类型仍从 ./index.js 导出。
import type { ModelId, ModelProviderId } from "./index.js";
import { ModelProtocolError } from "./protocol-error_core.js";
import { ModelErrorCode } from "./runtime-tables_core.js";

export function createModelProviderId(providerId: string): ModelProviderId {
  const normalized = providerId.trim();
  if (normalized.length === 0) {
    throw new ModelProtocolError(
      ModelErrorCode.InvalidModelSelection,
      "Model provider id is empty",
    );
  }
  return normalized as ModelProviderId;
}

export function createModelId(modelId: string): ModelId {
  const normalized = modelId.trim();
  if (normalized.length === 0) {
    throw new ModelProtocolError(ModelErrorCode.InvalidModelSelection, "Model id is empty");
  }
  return normalized as ModelId;
}
