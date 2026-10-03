// ListModels public declaration and prompt are retained compatibility material.
// Execution/projection replacement and exposed-source limits are in the model catalog spec.
import {
  LIST_MODELS_TOOL_NAME,
  ListModelsInputJsonSchema,
  ListModelsInputSchema,
  ListModelsOutputJsonSchema,
  ListModelsOutputSchema,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";
import { executeListModels, renderListModels } from "./list-models-projection.js";

const LIST_MODELS_TIMEOUT_MS = 10_000;
/** 照 ListSavedWorkflows：目录刻意轻（一次内存读可答），24k 足够几十行还留着余量。 */
const LIST_MODELS_MODEL_BYTES = 24_000;

const LIST_MODELS_DESCRIPTION = [
  "Lists the models this host has configured, so a dynamic workflow's subagents can be pointed at one.",
  "",
  "- Each row's `id` (`providerId/modelId`) pastes verbatim into the `subagent_model` field of CreateWorkflow or AmendWorkflow. Append `$<level>` to pick a reasoning level from that row's `reasoningLevels`.",
  "- This tool does NOT change the model you are running on. The session model is the user's choice and only the user changes it; `subagent_model` only moves the workflow's subagents.",
  "- The model the session is on right now is marked `[current]` — setting the subagents to that one is the same as omitting the field.",
  "- A row marked `disabled` cannot be used (no API key, disabled by policy). Resolve that with the user rather than picking around it silently.",
].join("\n");

export const listModelsToolEntry: ToolEntry = {
  capability: "List the models this host has configured, for choosing a workflow's subagent model",
  metadata: {
    name: LIST_MODELS_TOOL_NAME,
    description: LIST_MODELS_DESCRIPTION,
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: LIST_MODELS_TIMEOUT_MS,
    maxOutputBytes: LIST_MODELS_MODEL_BYTES,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: executeListModels,
  inputSchema: ListModelsInputJsonSchema,
  outputSchema: ListModelsOutputJsonSchema,
  runtimeInputSchema: ListModelsInputSchema,
  runtimeOutputSchema: ListModelsOutputSchema,
  formatModelContent: renderListModels,
  permission: {
    permission: "listModels",
    reason: "ListModels reads the host's configured model catalog",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    // 入参是空对象，所以模式只按工具名匹配（同 ListSavedWorkflows）。
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
    // 刻意**不**继承 CreateWorkflow 的 alwaysAsk：那道门的理由是「执行整块代码」，
    // 读一张已配置模型的表不属于它。
  },
  resultBudget: {
    maxInlineBytes: LIST_MODELS_MODEL_BYTES,
    maxModelBytes: LIST_MODELS_MODEL_BYTES,
    strategy: "truncate",
    preview: {
      maxBytes: LIST_MODELS_MODEL_BYTES,
      direction: "head",
    },
  },
  timeout: {
    kind: "timed",
    defaultMs: LIST_MODELS_TIMEOUT_MS,
    maxMs: LIST_MODELS_TIMEOUT_MS,
    allowCallOverride: false,
  },
  cancellation: {
    supported: false,
    cleanup: "none",
    userVisibleMessage: "ListModels reads the in-memory model catalog and cannot be cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
