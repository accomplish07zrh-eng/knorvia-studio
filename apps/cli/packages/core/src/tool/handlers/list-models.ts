// SPDX-License-Identifier: Apache-2.0
// ListModels：宿主已配置模型目录（为工作流 subagent_model 选型）。执行与渲染在 original 投影面
// （list-models-projection）——本文件只做公开声明与引导文案。入参空对象，模式只按工具名匹配。

import {
  LIST_MODELS_TOOL_NAME,
  ListModelsInputJsonSchema,
  ListModelsInputSchema,
  ListModelsOutputJsonSchema,
  ListModelsOutputSchema,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";
import { executeListModels, renderListModels } from "./list-models-projection.js";

const LIST_MODELS_TIMEOUT_MS = 10_000; // 内存读，10 秒封顶
/** 照 ListSavedWorkflows：目录刻意轻，24k 足够几十行还留余量。 */
const LIST_MODELS_MODEL_BYTES = 24_000; // 24k 模型面预算

const LIST_MODELS_DESCRIPTION = [
  "Lists the models this host has configured, so a dynamic workflow's subagents can be pointed at one.", // 目录用途
  "",
  "- Each row's `id` (`providerId/modelId`) pastes verbatim into the `subagent_model` field of CreateWorkflow or AmendWorkflow. Append `$<level>` to pick a reasoning level from that row's `reasoningLevels`.", // id 粘贴规则
  "- This tool does NOT change the model you are running on. The session model is the user's choice and only the user changes it; `subagent_model` only moves the workflow's subagents.", // 不动会话模型
  "- The model the session is on right now is marked `[current]` — setting the subagents to that one is the same as omitting the field.", // current 标记
  "- A row marked `disabled` cannot be used (no API key, disabled by policy). Resolve that with the user rather than picking around it silently.", // disabled 行
].join("\n");

function toolMetadata() {
  // 声明面：名字、文案、只读与预算档
  const surface = {
    name: LIST_MODELS_TOOL_NAME, // 工具名（契约面）
    description: LIST_MODELS_DESCRIPTION, // 引导文案（协议面）
    readOnly: true, // 只读
    destructive: false, // 无破坏
    concurrentSafe: true, // 并发安全
    timeoutMs: LIST_MODELS_TIMEOUT_MS, // 10s
    maxOutputBytes: LIST_MODELS_MODEL_BYTES, // 24k
    sideEffectScope: "none" as const,
    riskLevel: "low" as const,
    needsApproval: false, // 免确认（读表）
  };
  return surface;
}

function toolPermission(): ToolEntry["permission"] {
  // 权限面：读表免确认，模式只按工具名
  const surface = {
    permission: "listModels" as const, // 权限名
    reason: "ListModels reads the host's configured model catalog", // 理由（协议面）
    riskLevel: "low" as const,
    sideEffectScope: "none" as const,
    needsApproval: false,
    // 入参是空对象：模式只按工具名匹配（同 ListSavedWorkflows）。
    patternSources: ["toolName"] as ToolEntry["permission"]["patternSources"],
    alwaysAllowPatternSources: ["toolName"] as ToolEntry["permission"]["alwaysAllowPatternSources"],
    denyPriority: "beforeAsk" as const,
    // 不继承 CreateWorkflow 的 alwaysAsk：那道门是「执行整块代码」，读一张表不属于它。
  };
  return surface;
}

function toolBudget() {
  // 预算面：内联/模型/预览同值，超限截断
  const surface = {
    maxInlineBytes: LIST_MODELS_MODEL_BYTES, // 24k 内联上限
    maxModelBytes: LIST_MODELS_MODEL_BYTES, // 24k 模型面上限
    strategy: "truncate" as const, // 超限截断
    preview: { // 预览
      maxBytes: LIST_MODELS_MODEL_BYTES, // 预览同预算
      direction: "head" as const,
    },
  };
  return surface;
}

export const listModelsToolEntry: ToolEntry = {
  capability: "List the models this host has configured, for choosing a workflow's subagent model", // 能力一句话
  metadata: toolMetadata(),
  handler: executeListModels, // 转口：执行面（original 投影）
  inputSchema: ListModelsInputJsonSchema, // 契约 schema 四件
  outputSchema: ListModelsOutputJsonSchema,
  runtimeInputSchema: ListModelsInputSchema,
  runtimeOutputSchema: ListModelsOutputSchema,
  formatModelContent: renderListModels, // 转口：渲染面（original 投影）
  permission: toolPermission(),
  resultBudget: toolBudget(),
  timeout: {
    kind: "timed" as const,
    defaultMs: LIST_MODELS_TIMEOUT_MS, // 10s
    maxMs: LIST_MODELS_TIMEOUT_MS, // 10s 封顶
    allowCallOverride: false, // 调用方不得放宽
  },
  cancellation: {
    supported: false, // 不可取消
    cleanup: "none" as const,
    userVisibleMessage: "ListModels reads the in-memory model catalog and cannot be cancelled", // 取消语义文案
  },
  trace: {
    required: true, // 必带 trace
    propagateToAdapters: false, // 不外传
    recordInput: "summary" as const,
    recordOutput: "summary" as const,
  },
};
