// SPDX-License-Identifier: Apache-2.0
// 模型面：CLI 公共类型名与一次选择的校验入口。
// 组织方式：字段定义一律从共享数据 schema 取别名（不复制 Provider 配置定义），
// 只在最后放本模块自己的运行时入口。

import type {
  JsonSchema,
  ModelInputMessage,
  ModelId,
  ModelProviderId,
  ModelStreamEvent,
  ModelTextResult,
  ModelToolContract,
} from "./index.js";
import { modelSelectionSchema, type ModelSelection } from "@knorvia/shared/model-selection";
import type { ModelPropertiesData, ModelOptionSpecsData } from "@knorvia/shared/model-config";

/** 选择值类型直接复用共享 schema 的导出，避免两处定义漂移。 */
export type { ModelSelection } from "@knorvia/shared/model-selection";

// 只保留 CLI 公共类型名；字段来自同一份数据 schema，不复制 Provider 配置定义。
export type {
  ModelInputFormatData as ModelInputFormat,
  ModelOutputFormatData as ModelOutputFormat,
  EnumOptionSpecData as EnumOptionSpec,
  LimitOptionSpecData as LimitOptionSpec,
} from "@knorvia/shared/model-config";

export type ModelOptionSpecs = ModelOptionSpecsData;
export type ModelProperties = ModelPropertiesData;
export type ModelPropertiesInput = ModelProperties;

/** 一次请求上的模型选项；不传表示用模型默认值。 */
export interface ModelOptions {
  reasoningLevel?: string;
  maxOutputTokens?: number;
}

/** 模型请求：消息、工具契约、结构化输出 schema、选项与取消信号。 */
export interface ModelRequest {
  messages: ModelInputMessage[];
  tools?: ModelToolContract[];
  responseJsonSchema?: JsonSchema;
  options?: ModelOptions;
  abortSignal?: AbortSignal;
}

// 第一阶段沿用已经完成 Provider SDK 归一化的结果与流事件字段；
// 旧名字只保留在 Adapter 兼容边界，业务调用统一使用这两个名字。
export type ModelResult = ModelTextResult;
export type ModelEvent = ModelStreamEvent;

/** 一个已选定的模型：身份、属性、选项规格，以及绑定选项后的生成入口。 */
export interface Model {
  readonly providerId: ModelProviderId;
  readonly modelId: ModelId;
  readonly displayName?: string;
  readonly properties: ModelProperties;
  readonly optionSpecs: ModelOptionSpecs;
  readonly options: ModelOptions;

  bind(options?: ModelOptions): Model;
  generateText(request: ModelRequest): Promise<ModelResult>;
  streamText(request: ModelRequest): AsyncIterable<ModelEvent>;
}

/** 校验当前 ModelSelection 值；旧数据库格式只在版本化 migration 转换，不在普通读取时兜底。 */
export function parseModelSelectionValue(value: unknown): ModelSelection | undefined {
  const outcome = modelSelectionSchema.safeParse(value);
  if (!outcome.success) return undefined;
  return outcome.data;
}
