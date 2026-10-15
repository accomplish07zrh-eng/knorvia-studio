// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export interface ModelExecutionRequest extends Omit<ModelRequest, "options"> {
  options: Required<ModelOptions>;
}
export interface ModelExecutor {
  generateText(request: ModelExecutionRequest): Promise<ModelResult>;
  streamText(request: ModelExecutionRequest): AsyncIterable<ModelEvent>;
}
export interface CreateModelOptions {
  providerId: ModelProviderId;
  modelId: ModelId;
  displayName?: string;
  properties: ModelPropertiesInput;
  optionSpecs: ModelOptionSpecs;
  options?: ModelOptions;
  executor: ModelExecutor;
}
export function createModel(input: CreateModelOptions): Model {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
