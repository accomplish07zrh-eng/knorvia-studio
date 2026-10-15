// SPDX-License-Identifier: Apache-2.0
// 模型执行装配门面：既有导出面（配置形状、业务错误、请求体提取、错误化 fetch、执行类）不变，
// 实现住在 support/（execution-contract 契约形状、provider-routing 路由内核、business-error 内核）。
// 语义由 B1–B6 锁定（路由表、合并顺序、错误文案、摘要形状），逐字保持。

import { compileModelOptionMaps, type ModelOptionValues } from "@knorvia/model-option-map";
import type { Logger, ModelRequestAuth } from "@knorvia/contracts";
import type { RegistryProviderConfig } from "@knorvia/provider";
import type { RawRequestBodyCapture } from "./model-option-map-fetch.js";
import { createModelOptionMapFetch } from "./model-option-map-fetch.js";
import { createAnthropicCompatFetch } from "./anthropic-stream-compat.js";
import { createOpenAIResponsesJsonCompatFetch } from "./openai-responses-json-compat.js";
import { createNetworkProxyFetch } from "../network/proxy-fetch.js";
import type {
  AiSdkBoundModelResolution,
  AiSdkModelExecutionConfig,
  AiSdkModelExecutionOptions,
  AiSdkResolvedModel,
} from "./support/execution-contract.js";
import { buildLanguageModel, readProviderShim } from "./support/provider-routing.js";
import { createProviderBusinessErrorFetch } from "./support/business-error.js";

export type {
  AiSdkBoundModelResolution,
  AiSdkModelExecutionConfig,
  AiSdkModelExecutionOptions,
  AiSdkNetworkConfig,
  AiSdkResolvedModel,
  AiSdkProviderKind,
  EnvRecord,
  ProviderBusinessErrorFetchOptions,
  ProviderBusinessErrorOptions,
  ProviderCode,
} from "./support/execution-contract.js";
export {
  ProviderBusinessError,
  createProviderBusinessErrorFetch,
  isProviderBusinessError,
  readProviderBusinessFailureFromBody,
} from "./support/business-error.js";

type ProviderFetch = typeof globalThis.fetch;

export class AiSdkModelExecution {
  private readonly executionConfig: AiSdkModelExecutionConfig;
  private readonly logger?: Logger;
  private readonly transport?: ProviderFetch;

  constructor(
    executionConfig: AiSdkModelExecutionConfig,
    options: AiSdkModelExecutionOptions = {},
  ) {
    this.executionConfig = executionConfig;
    this.logger = options.logger;
    this.transport = options.transport;
  }

  bindModel(input: {
    providerId: string;
    modelId: string;
    providerConfig: RegistryProviderConfig;
    supportsJsonSchemaOutput: boolean;
    optionSpecs: { reasoningLevel: { map: string }; maxOutputTokens: { map: string } };
  }): AiSdkBoundModelResolution {
    let maps: ReturnType<typeof compileMaps> | undefined;
    const capture: RawRequestBodyCapture = {};
    const compileMaps = () =>
      compileModelOptionMaps({
        reasoningLevel: { map: input.optionSpecs.reasoningLevel.map },
        maxOutputTokens: { map: input.optionSpecs.maxOutputTokens.map },
      });
    const resolve = (requestAuth?: ModelRequestAuth, options?: ModelOptionValues) => {
      const shim = readProviderShim(
        input.providerConfig,
        requestAuth,
        this.executionConfig,
        input.providerId,
      );
      if (options) {
        maps ??= compileMaps();
        capture.body = undefined;
      }
      const wire = this.transport ?? globalThis.fetch;
      const proxied = createNetworkProxyFetch({
        caCertFile: this.executionConfig.network?.caCertFile,
        env: this.executionConfig.env,
        httpProxy: this.executionConfig.network?.httpProxy,
        noProxy: this.executionConfig.network?.noProxy,
        fetch: wire,
      });
      const guarded = createProviderBusinessErrorFetch({
        providerId: input.providerId,
        providerKind: shim.kind,
        fetch: proxied,
      });
      const decorated = options
        ? createModelOptionMapFetch({
            capture,
            fetch: guarded,
            maps: maps as NonNullable<typeof maps>,
            values: options,
          })
        : guarded;
      const compat =
        shim.kind === "anthropic"
          ? createAnthropicCompatFetch(decorated)
          : shim.kind === "openai"
            ? createOpenAIResponsesJsonCompatFetch(decorated)
            : decorated;
      const resolved: AiSdkResolvedModel = {
        baseURL: shim.baseURL,
        headers: shim.headers,
        providerId: input.providerId as AiSdkResolvedModel["providerId"],
        modelId: input.modelId as AiSdkResolvedModel["modelId"],
        model: buildLanguageModel(shim, input.modelId, compat),
        providerKind: shim.kind,
        providerOptions: shim.providerOptions,
        rawRequestBodyCapture: capture,
      };
      return resolved;
    };
    return {
      resolved: resolve(undefined),
      resolveRequest: ({ options, requestAuth }) => resolve(requestAuth, options),
    };
  }
}
