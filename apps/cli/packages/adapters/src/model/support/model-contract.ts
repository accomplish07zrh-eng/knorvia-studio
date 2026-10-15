// SPDX-License-Identifier: Apache-2.0
// 模型契约形状：执行请求（选项已补齐）、执行器端口、模型装配入参。
// 名称与形状是兼容面（model.ts 再导出），字段语义见 behavior.md B7–B9。

import type {
  ModelEvent,
  ModelOptionSpecs,
  ModelOptions,
  ModelPropertiesInput,
  ModelId,
  ModelProviderId,
  ModelRequest,
  ModelResult,
} from "@knorvia/contracts";

export interface ModelExecutionRequest extends Omit<ModelRequest, "options"> {
  options: Required<ModelOptions>; // 补齐后的冻结选项
}

export interface ModelExecutor {
  generateText(request: ModelExecutionRequest): Promise<ModelResult>; // 非流式执行
  streamText(request: ModelExecutionRequest): AsyncIterable<ModelEvent>; // 流式执行
}

export interface CreateModelOptions {
  providerId: ModelProviderId; // provider 身份（创建时冻结）
  modelId: ModelId; // 模型身份（创建时冻结）
  displayName?: string; // 展示名
  properties: ModelPropertiesInput; // 能力表（校验依据）
  optionSpecs: ModelOptionSpecs; // 选项规格（校验依据）
  options?: ModelOptions; // 初始绑定选项
  executor: ModelExecutor; // 执行器端口
}
