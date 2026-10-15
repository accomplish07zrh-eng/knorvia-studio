// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export type { AiSdkModelRetryOptions } from "./retry-policy.js";
export type {
  AiSdkGenerateTextOptions,
  AiSdkGenerateTextResult,
  AiSdkModelRuntime,
  AiSdkModelTextRequest,
  AiSdkStreamTextOptions,
  AiSdkStreamTextResult,
} from "./runner-runtime.js";
export { normalizeUsage, toModelStreamEvent } from "./runner-normalization.js";
export interface AiSdkModelAdapterOptions {
  defaultHeaders?: AiSdkModelExecutionConfig["defaultHeaders"];
  network?: AiSdkNetworkConfig;
  runtime?: AiSdkModelRuntime;
  env?: EnvRecord;
  debugDir?: string;
  logger?: Logger;
  retry?: AiSdkModelRetryOptions;
  statusSink?: ModelStatusSink;
  streamIdleTimeoutMs?: number;
  modelIoFullRetentionEnabled?: boolean;
}
export interface CreateAiSdkModelOptions {
  providerId: string;
  modelId: string;
  providerConfig: RegistryProviderConfig;
  modelConfig: RegistryModelConfig;
  displayName?: string;
  options?: ModelOptions;
  requestDependencies?: ModelRequestDependencies;
}
export class AiSdkModelAdapter {
  private readonly env: EnvRecord;
  private readonly debugDir?: string;
  private readonly logger?: Logger;
  private readonly retry;
  private readonly runtime;
  private readonly execution;
  private statusSink?: ModelStatusSink;
  private readonly streamIdleTimeoutMs: number;
  private fullRetention: boolean;
  constructor(options: AiSdkModelAdapterOptions) {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
  setModelIoFullRetentionEnabled(enabled: boolean): void {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
  addStatusSink(sink: ModelStatusSink): void {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
  createModel(options: CreateAiSdkModelOptions): Model {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
}
