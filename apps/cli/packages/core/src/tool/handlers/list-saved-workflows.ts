// SPDX-License-Identifier: Apache-2.0
// ListSavedWorkflows：枚举本项目保存的 dwf 定义（清单、无状态、有名字）——与 ListWorkflowRuns 的
// run 历史是两件事，描述必须把这点说穿。handler 恒取本会话工作目录（模型无权跨项目扫盘）；
// 模型面走块式（定义带描述与参数表，是选型依据，挤一行会把信息压没）。

import {
  LIST_SAVED_WORKFLOWS_TOOL_NAME,
  ListSavedWorkflowsInputJsonSchema,
  ListSavedWorkflowsInputSchema,
  ListSavedWorkflowsOutputJsonSchema,
  ListSavedWorkflowsOutputSchema,
  SAVED_WORKFLOW_PROJECT_DIR,
  type ListSavedWorkflowsOutput,
  type ModelMessageContent,
} from "@knorvia/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";
import { listSavedWorkflows } from "./saved-workflows/index.js";
import { renderSavedWorkflowListing } from "./list-saved-workflows-model-renderer.js";

const LIST_SAVED_WORKFLOWS_TIMEOUT_MS = 10_000; // 一次目录扫描，10 秒封顶
/** 照 ListWorkflowRuns：清单刻意轻，24k 足够几十条还留余量。 */
const LIST_SAVED_WORKFLOWS_MODEL_BYTES = 24_000;

const LIST_SAVED_WORKFLOWS_DESCRIPTION = [
  `Lists the dynamic workflows saved in this project (\`${SAVED_WORKFLOW_PROJECT_DIR}/\`, keyed on the session's working directory) and the global archive (\`~/.knorvia-studio/workflows\`, available from every project). These are workflow DEFINITIONS you can run, not past runs — for the run history use ListWorkflowRuns instead.`,
  "",
  "- Each row gives the name, what the workflow does, when to reach for it, and the arguments it takes.", // 行字段
  "- Run one by passing its name to CreateWorkflow as `saved: { name, args }`. The user still confirms the run.", // 运行入口
  "- Check here before writing a workflow from scratch: if the project already saved one that fits, running it beats rebuilding it.", // 先查后写
  "- `invalid` lists saved files that could not be read (usually a hand-edited metadata block). They are named so they can be fixed, not silently skipped.", // invalid 语义
].join("\n");

/** 从本会话工作目录读清单（模型无权跨项目扫盘）。 */
function readListing(cwd: string | undefined): ListSavedWorkflowsOutput {
  const { entries, invalid } = listSavedWorkflows({ cwd: cwd ?? "." });
  return {
    workflows: entries, // 定义清单
    // 为空时缺席：一个空数组会给每次调用挂一个噪音字段。
    ...(invalid.length > 0 ? { invalid } : {}), // 可读性失败的条目
  } as ListSavedWorkflowsOutput; // 契约形状
}

const listSavedWorkflowsHandler: ToolHandler = async (call, scope) => {
  ListSavedWorkflowsInputSchema.parse(call);
  return readListing(scope.workingDirectory);
};

function escapeAmp(value: string): string {
  return value.replaceAll("&", "&amp;"); // & 转义
}

function escapeQuote(value: string): string {
  return value.replaceAll('"', "&quot;"); // 引号转义
}

function escapeLt(value: string): string {
  return value.replaceAll("<", "&lt;"); // 尖括号转义
}

/** 属性位转义：名字与路径都可能带引号或尖括号（路径尤其），裸拼会造出畸形标签。 */
function escapeAttribute(text: string): string {
  return escapeLt(escapeQuote(escapeAmp(text))); // 三级替换链
}

/** 空清单也要说成一句话（含定义目录），空容器会被读成「工具没答上来」。 */
function emptyListing(): ModelMessageContent {
  const lines = [
    '<saved_workflows count="0">', // 空容器
    `No workflows are saved in this project yet. Saved definitions live in ${SAVED_WORKFLOW_PROJECT_DIR}/.`,
    "</saved_workflows>", // 容器闭合
  ];
  return lines.join("\n"); // 空清单句
}

/**
 * 模型面：一个 XML-ish 容器 + 一 workflow 一块。与 ListWorkflowRuns 的单行属性式刻意不同——
 * run 是低信息密度高基数实体，而保存的定义带描述、使用时机和参数表，是模型选型的依据。
 */
function formatListSavedWorkflowsModelContent(raw: unknown): ModelMessageContent {
  const parsed = ListSavedWorkflowsOutputSchema.safeParse(raw); // 契约形状校验
  if (!parsed.success) return "ListSavedWorkflows returned an invalid result."; // 定型兜底

  const { workflows, invalid } = parsed.data; // 清单与坏文件
  const bare = workflows.length === 0 && invalid === undefined;
  if (bare) return emptyListing(); // 空清单句
  return renderSavedWorkflowListing(parsed.data, escapeAttribute); // 块式清单渲染（original 面）
}

function toolMetadata() {
  // 声明面：名字、引导文案、只读与预算档
  const surface = {
    name: LIST_SAVED_WORKFLOWS_TOOL_NAME, // 工具名（契约面）
    description: LIST_SAVED_WORKFLOWS_DESCRIPTION, // 引导文案（协议面）
    readOnly: true, // 只读
    destructive: false, // 无破坏
    concurrentSafe: true, // 并发安全
    timeoutMs: LIST_SAVED_WORKFLOWS_TIMEOUT_MS, // 10s
    maxOutputBytes: LIST_SAVED_WORKFLOWS_MODEL_BYTES, // 24k
    sideEffectScope: "none" as const,
    riskLevel: "low" as const,
    needsApproval: false, // 免确认
  };
  return surface;
}

function toolPermission(): ToolEntry["permission"] {
  // 权限面：读清单免确认，模式只按工具名
  const surface = {
    permission: "listSavedWorkflows" as const, // 权限名
    reason: "ListSavedWorkflows reads the saved workflow definitions of the current project", // 理由（协议面）
    riskLevel: "low" as const,
    sideEffectScope: "none" as const,
    needsApproval: false,
    // 输入无路径主体：模式只按工具名匹配。
    patternSources: ["toolName"] as ToolEntry["permission"]["patternSources"],
    alwaysAllowPatternSources: ["toolName"] as ToolEntry["permission"]["alwaysAllowPatternSources"],
    denyPriority: "beforeAsk" as const,
    // 不继承 SaveWorkflow / CreateWorkflow 的 alwaysAsk：那两道门是「写仓库」与「执行整块代码」。
  };
  return surface;
}

function toolBudget() {
  // 预算面：内联/模型/预览同值，超限截断
  const surface = {
    maxInlineBytes: LIST_SAVED_WORKFLOWS_MODEL_BYTES, // 24k 内联上限
    maxModelBytes: LIST_SAVED_WORKFLOWS_MODEL_BYTES, // 24k 模型面上限
    strategy: "truncate" as const, // 超限截断
    preview: { // 预览
      maxBytes: LIST_SAVED_WORKFLOWS_MODEL_BYTES, // 预览同预算
      direction: "head" as const,
    },
  };
  return surface;
}

export const listSavedWorkflowsToolEntry: ToolEntry = {
  capability: "List the reusable dynamic-workflow definitions saved in this project", // 能力一句话
  metadata: toolMetadata(),
  handler: listSavedWorkflowsHandler,
  inputSchema: ListSavedWorkflowsInputJsonSchema,
  outputSchema: ListSavedWorkflowsOutputJsonSchema,
  runtimeInputSchema: ListSavedWorkflowsInputSchema,
  runtimeOutputSchema: ListSavedWorkflowsOutputSchema,
  formatModelContent: formatListSavedWorkflowsModelContent,
  permission: toolPermission(),
  resultBudget: toolBudget(),
  timeout: {
    kind: "timed" as const,
    defaultMs: LIST_SAVED_WORKFLOWS_TIMEOUT_MS, // 10s
    maxMs: LIST_SAVED_WORKFLOWS_TIMEOUT_MS, // 10s 封顶
    allowCallOverride: false, // 调用方不得放宽
  },
  cancellation: {
    supported: false, // 不可取消
    cleanup: "none" as const,
    userVisibleMessage:
      "ListSavedWorkflows scans the project's workflow directory synchronously and cannot be cancelled", // 取消语义文案
  },
  trace: {
    required: true, // 必带 trace
    propagateToAdapters: false,
    recordInput: "summary" as const, // 输入只留摘要
    recordOutput: "summary" as const, // 输出只留摘要
  },
};
