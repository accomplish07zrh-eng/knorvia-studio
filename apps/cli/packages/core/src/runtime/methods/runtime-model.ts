// SPDX-License-Identifier: Apache-2.0
// 运行时模型句柄入口（B12）：句柄构造与上下文合并层在 support/invocation-layer.ts，
// 这里保持兼容导出面。
import type { Model, ModelInvocationContext, ModelRequest } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeModelFactoryInput } from "../types.js";
import {
  buildRuntimeModel,
  wrapInvocationLayer,
  wrapWithRuntimeLayer,
} from "./support/invocation-layer.js";

export function createRuntimeModel(
  runtime: AgentRuntimeInternal,
  input: Omit<RuntimeModelFactoryInput, "selection"> & {
    selection: RuntimeModelFactoryInput["selection"] | undefined;
  },
): Model {
  return wrapWithRuntimeLayer(
    runtime,
    buildRuntimeModel(runtime, input as never, (factoryInput) =>
      runtime.modelFactory(factoryInput as never),
    ),
  );
}

export function withModelInvocationContext(
  model: Model,
  createContext: (request: ModelRequest) => ModelInvocationContext,
): Model {
  return wrapInvocationLayer(model, createContext as never);
}
