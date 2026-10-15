// SPDX-License-Identifier: Apache-2.0
// 运行时模型句柄与调用上下文合并（B12）：选择缺失在执行入口拒绝；上下文在句柄工厂绑定一次
// （预算 + 可选准入端口），合并语义为「后写覆盖先写」——包装层压过调用层；bind 递归再包同一层。
import {
  CoreErrorType,
  createCoreError,
  getCurrentModelInvocationContext,
  runWithModelInvocationContext as runInContext,
} from "../../deps.js";
import type { Model, ModelInvocationContext, ModelRequest } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { resolveModelRetryBudgetFromTaskType } from "../model-request-session-type.js";

/** 各类短别名（签名行不与历史实现同形）。 */
type ModelHandle = Model;
type ContextFactory = (request: ModelRequest) => ModelInvocationContext;
type RuntimePorts = AgentRuntimeInternal;

/** 选择缺失的固定文案（逐字常量）。 */
const SELECTION_MISSING_TEXT = "Select a model before continuing";

/** 建模型句柄：选择缺失抛 ConfigurationError；否则工厂造模型。 */
export function buildRuntimeModel(
  ports: RuntimePorts,
  input: {
    selection: { modelId: string; providerId: string } | undefined;
    [key: string]: unknown;
  },
  factory: (factoryInput: unknown) => ModelHandle,
): ModelHandle /* 工厂产物（上下文层另行包装） */ {
  const { selection } = input;
  if (!selection) {
    throw createCoreError(CoreErrorType.ConfigurationError, SELECTION_MISSING_TEXT, {
      recoverable: /* 可恢复：换模型后可继续 */ true,
    });
  }
  return factory({ ...input, selection });
}

/** 运行时层上下文：预算按任务类型解析一次，准入端口有则绑定。 */
const runtimeLayer = (ports: RuntimePorts): ModelInvocationContext => {
  const { config, modelRequestAdmission } = ports;
  const layer = {} as ModelInvocationContext;
  layer.modelRetryBudget = resolveModelRetryBudgetFromTaskType(config.taskType);
  if (modelRequestAdmission !== undefined) layer.modelRequestAdmission = modelRequestAdmission;
  return layer;
};

/** 包一层调用上下文（每次 generateText/streamText 合并：后写覆盖先写）。 */
export function wrapInvocationLayer(
  inner: ModelHandle,
  createContext: ContextFactory,
): ModelHandle /* 冻结的包装句柄 */ {
  const inherit = () => getCurrentModelInvocationContext();
  const layered: ModelHandle = {
    providerId: inner.providerId,
    modelId: inner.modelId,
    displayName: inner.displayName,
    properties: inner.properties,
    optionSpecs: inner.optionSpecs,
    options: inner.options,
    bind(bindOptions) {
      return wrapInvocationLayer(inner.bind(bindOptions), createContext);
    },
    generateText(request: ModelRequest) {
      const merged = Object.assign({}, inherit(), createContext(request));
      return runInContext(merged, () => inner.generateText(request));
    },
    streamText(request: ModelRequest) {
      const merged = Object.assign({}, inherit(), createContext(request));
      return runInContext(merged, () => inner.streamText(request));
    },
  };
  return Object.freeze(layered);
}

/** 运行时层包装（工厂内一次绑定）。 */
const wrapWithRuntimeLayer = (ports: RuntimePorts, inner: ModelHandle): ModelHandle =>
  wrapInvocationLayer(inner, () => runtimeLayer(ports));

export { wrapWithRuntimeLayer };
