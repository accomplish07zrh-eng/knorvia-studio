// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 本包追加的能力行：内置工具、压缩、目标、计划模式、子 Agent、MCP 与策略执行点。
// kernel-dsh-00 的 19 行是底座；这里在其后追加，并替换平台对应的 shell 执行器行。
// 行内容按 specs/contracts/kernel-dsh-builtins/README.md §二、§三 与 interface.md §五。
//
// 数值口径来自旧内核实测（core/src/compact/policy.ts 等），推导过程见 compression.ts。

import { join } from "node:path";
import { createRuntimeContextRow } from "./builtins-context.js";
import type { KernelPluginModuleIds } from "./builtins-modules.js";
import { KERNEL_COMPRESSION_CONFIG } from "./compression.js";
import type { KernelPluginRow } from "./composition.js";

/** 旧内核的 shell 超时口径：前台默认 120s、上限 600s（`core/src/tool/bash-timeout-policy.ts`）。 */
const SHELL_TIMEOUT_MS = 120_000;
const SHELL_MAX_TIMEOUT_MS = 600_000;

/** 旧内核单条命令输出上限：64 KiB（`core/src/tool/handlers/bash-output.ts` 的截断预算）。 */
const SHELL_MAX_OUTPUT_BYTES = 64_000;
/** 溢出后落盘文件的上限；与 DSH 默认同量级，避免超大输出把临时目录撑满。 */
const SHELL_MAX_SPILL_BYTES = 16_000_000;
/** 终止升级的宽限期：先 TERM 再 KILL，DSH 用它等管道排空。 */
const SHELL_GRACE_MS = 5_000;

/** 工具结果裁剪预算：旧内核按字符数裁中段，保留头尾（`core/src/tool/result-persistence-format.ts`）。 */
const TOOL_RESULT_THRESHOLD_CHARS = 8_192;
const TOOL_RESULT_HEAD_CHARS = 4_096;
const TOOL_RESULT_TAIL_CHARS = 1_024;

/** 目标模式的默认轮次上限；旧内核用同一量级的回合预算（`core/src/runtime/methods/target*`）。 */
const GOAL_DEFAULT_MAX_ROUNDS = 64;

/** 子 Agent 的后台模式：spawn 可续、fork 一次性（README G4 的 DSH 官方推荐组合）。 */
const SUBAGENT_SPAWN_TOOL = "subagent";
const SUBAGENT_FORK_TOOL = "subagent_fork";

/** 计划模式的部署文本；DSH 无内建文案，由 Knorvia 提供。 */
const PLAN_MODE_SECTION = [
  "You are in plan mode. Investigate first and do not modify the workspace until the plan is approved.",
  "Use read-only inspection, searches and analysis to ground the plan in the actual repository.",
  "When the plan is decision-complete, present it through exit_plan_mode as your final tool call and wait for approval.",
  "Do not implement, write files, run formatters that rewrite tracked files, or commit while planning.",
].join(" ");

/** web 工具的协作超时；与旧内核 webfetch/websearch 的预算同量级。 */
const WEB_SEARCH_TIMEOUT_MS = 60_000;
const WEB_FETCH_TIMEOUT_MS = 30_000;

/**
 * 平台无关的行：策略执行点、托管环境、命令面、压缩、目标、计划、子 Agent 与工具。
 * shell 执行器与 shell 工具两支按平台二选一，见 {@link platformShellRows}。
 * 只有沙箱策略的写边界依赖启动 cwd，因此这一节做成构造函数而不是常量表。
 *
 * @param workspaceRoot - 启动 cwd，成为 workspace-write 的写边界。
 * @returns 平台无关的行。
 */
function sharedRows(workspaceRoot: string): KernelPluginRow[] {
  return [
    // ── 子进程与托管环境：shell 执行器依赖 subprocess seam 与 shellEnv 注册表 ──
    { id: "subprocess", name: "@deepseek-ai/dsh-subprocess-local" },
    { id: "shell-env", name: "@deepseek-ai/dsh-shell-env" },

    // ── 沙箱与审批：本包只挂策略执行点，五种权限模式的产品语义归 kernel-plugin-policy ──
    { id: "sandbox", name: "@deepseek-ai/dsh-sandbox-local" },
    {
      id: "sandbox-policy",
      name: "@deepseek-ai/dsh-sandbox-policy",
      // workspaceRoot 显式给出启动 cwd：DSH 的缺省是 process.cwd()，内核被别的进程
      // 宿主加载时那是宿主的目录、不是会话工作区。接口合同 §五要求这里等于启动 cwd。
      config: { mode: "workspace-write", workspaceRoot },
    },
    { id: "approval", name: "@deepseek-ai/dsh-user-approval", config: { policy: "ask" } },

    // ── 文件系统与工具 ──
    { id: "fs-sandbox", name: "@deepseek-ai/dsh-fs-sandbox" },
    { id: "fs-observation-policy", name: "@deepseek-ai/dsh-fs-observation-policy" },
    { id: "tool-fs", name: "@deepseek-ai/dsh-tool-fs" },
    // sampleOverCapGlobResults 是必填（无 schema 默认值），旧内核的 glob 不做抽样，
    // 取修改时间头部即可，因此固定 false。
    {
      id: "tool-fs-search",
      name: "@deepseek-ai/dsh-tool-fs-search",
      config: { sampleOverCapGlobResults: false },
    },
    {
      id: "tool-todo",
      name: "@deepseek-ai/dsh-tool-todo",
      config: { allowParallelInProgress: true },
    },
    { id: "tool-skill", name: "@deepseek-ai/dsh-tool-skill" },
    { id: "tool-jobs", name: "@deepseek-ai/dsh-tool-jobs" },
    // web 工具依赖 ctx.web seam；provider 行来自 DSH 官方组合（搜索走 DeepSeek，
    // 抓取走 HTTP）。旧内核的两个工具是自实现，这里挂 DSH 的等价能力。
    {
      id: "web",
      name: "@deepseek-ai/dsh-web",
      config: { searchProvider: "deepseek-official", fetchProvider: "http" },
    },
    { id: "web-search-deepseek", name: "@deepseek-ai/dsh-web-search-deepseek" },
    { id: "web-fetch-http", name: "@deepseek-ai/dsh-web-fetch-http" },
    {
      id: "tool-web",
      name: "@deepseek-ai/dsh-tool-web",
      config: {
        search: true,
        fetch: true,
        searchTimeoutMs: WEB_SEARCH_TIMEOUT_MS,
        fetchTimeoutMs: WEB_FETCH_TIMEOUT_MS,
      },
    },

    // ── 作业注册表（后台 shell 与 job 工具的所有者） ──
    { id: "jobs", name: "@deepseek-ai/dsh-jobs-local" },

    // ── 命令面：/compact、/goal、/plan ──
    { id: "commands", name: "@deepseek-ai/dsh-commands" },

    // ── 压缩链：计量 → 自动压缩 → 工具结果裁剪 → 手动 /compact ──
    { id: "token-meter", name: "@deepseek-ai/dsh-token-meter" },
    {
      id: "compaction-basic",
      name: "@deepseek-ai/dsh-compaction-basic",
      // 逐字段展开而不是整对象透传：配置类型是窄接口，组合行的 config 是宽记录，
      // 直接透传会丢索引签名。顺序按 README §三 的口径排列，便于与合同对照。
      config: {
        thresholdRatio: KERNEL_COMPRESSION_CONFIG.thresholdRatio,
        headroomTokens: KERNEL_COMPRESSION_CONFIG.headroomTokens,
        maxTokens: KERNEL_COMPRESSION_CONFIG.maxTokens,
        retainRatio: KERNEL_COMPRESSION_CONFIG.retainRatio,
        auto: KERNEL_COMPRESSION_CONFIG.auto,
        compactionRetries: KERNEL_COMPRESSION_CONFIG.compactionRetries,
        maxOverflowRetries: KERNEL_COMPRESSION_CONFIG.maxOverflowRetries,
        modelPolicies: KERNEL_COMPRESSION_CONFIG.modelPolicies,
      },
    },
    {
      id: "tool-result-pruner",
      name: "@deepseek-ai/dsh-compaction-tool-result-pruner",
      config: {
        thresholdChars: TOOL_RESULT_THRESHOLD_CHARS,
        headChars: TOOL_RESULT_HEAD_CHARS,
        tailChars: TOOL_RESULT_TAIL_CHARS,
      },
    },
    { id: "command-compact", name: "@deepseek-ai/dsh-command-compact" },

    // ── 目标模式 ──
    {
      id: "goal",
      name: "@deepseek-ai/dsh-goal",
      config: { defaultMaxGoalRounds: GOAL_DEFAULT_MAX_ROUNDS },
    },
    { id: "goal-round-driver", name: "@deepseek-ai/dsh-goal-round-driver" },
    { id: "command-goal", name: "@deepseek-ai/dsh-command-goal" },
    { id: "tool-goal", name: "@deepseek-ai/dsh-tool-goal" },

    // ── 计划模式：section 是必填部署文本，由 Knorvia 提供 ──
    { id: "plan-mode", name: "@deepseek-ai/dsh-plan-mode", config: { section: PLAN_MODE_SECTION } },

    // ── 子 Agent：spawn 可续、fork 一次性，加控制面与名单工具 ──
    { id: "subagent", name: "@deepseek-ai/dsh-subagent" },
    {
      id: "subagent-spawn-in-process",
      name: "@deepseek-ai/dsh-subagent-spawn-in-process",
      config: { providerName: "spawn" },
    },
    {
      id: "subagent-fork-in-process",
      name: "@deepseek-ai/dsh-subagent-fork-in-process",
      config: { providerName: "fork" },
    },
    { id: "tool-subagent-control", name: "@deepseek-ai/dsh-tool-subagent-control" },
    {
      id: "tool-subagent-list-agents",
      name: "@deepseek-ai/dsh-tool-subagent-control/list-agents",
    },
    {
      id: "tool-subagent",
      name: "@deepseek-ai/dsh-tool-subagent",
      config: { provider: "spawn", toolName: SUBAGENT_SPAWN_TOOL, backgroundMode: "continuable" },
    },
    {
      id: "tool-subagent-fork",
      name: "@deepseek-ai/dsh-tool-subagent",
      config: { provider: "fork", toolName: SUBAGENT_FORK_TOOL, backgroundMode: "one-shot" },
    },
  ];
}

/**
 * 平台相关的 shell 行：执行器用 Knorvia 子类顶替官方行（同 id），
 * 工具行按平台启用对应的一支。DSH 官方对不适用的那支本来就 `disabled`，
 * 这里保持同样的取舍，避免加载不可能工作的执行器。
 *
 * @param platform - `process.platform` 的取值。
 * @param moduleIds - 两个 Knorvia 执行器模块的可解析地址。
 * @returns 该平台要挂的行。
 */
function platformShellRows(
  platform: string,
  moduleIds: { readonly bash: string; readonly pwsh: string },
): KernelPluginRow[] {
  const shellConfig = {
    timeoutMs: SHELL_TIMEOUT_MS,
    maxTimeoutMs: SHELL_MAX_TIMEOUT_MS,
    maxOutputBytes: SHELL_MAX_OUTPUT_BYTES,
    maxSpillBytes: SHELL_MAX_SPILL_BYTES,
    graceMs: SHELL_GRACE_MS,
  };
  if (platform === "win32") {
    return [
      { id: "shell", name: moduleIds.pwsh, config: shellConfig },
      { id: "tool-shell", name: "@deepseek-ai/dsh-tool-pwsh" },
    ];
  }
  return [
    { id: "shell", name: moduleIds.bash, config: shellConfig },
    { id: "tool-shell", name: "@deepseek-ai/dsh-tool-bash" },
  ];
}

/**
 * 组装本包追加的整份行清单。
 *
 * @param options.platform - 平台，决定 shell 支。
 * @param options.workspaceRoot - 启动 cwd；沙箱策略的写边界取它。
 * @param options.moduleIds - 本包自有插件模块的可解析地址（组合物化时算好）。
 * @returns 追加行；调用方负责把它们接在 kernel-dsh-00 的 19 行之后。
 */
export function createBuiltinsRows(options: {
  readonly platform: string;
  readonly workspaceRoot: string;
  readonly moduleIds: KernelPluginModuleIds;
}): KernelPluginRow[] {
  const rows: KernelPluginRow[] = [...platformShellRows(options.platform, options.moduleIds)];
  rows.push(...sharedRows(options.workspaceRoot));
  // 运行环境上下文放在最后：它是 Knorvia 自有插件，与 DSH 行分开，
  // 读者能一眼看出哪些行是我们加的。
  rows.push(createRuntimeContextRow(options.moduleIds.runtimeContext));
  return rows;
}

/**
 * 生成 MCP 客户端行。DSH 的 MCP 是启动期组合（每个服务器一行），
 * 因此这条路径在 boot 时调用一次；运行期增删要靠重启（README G6）。
 *
 * @param servers - Knorvia 侧的服务器配置，按服务器名索引。
 * @returns 每个启用的服务器一行。
 */
export function createMcpRows(
  servers: Readonly<Record<string, KernelMcpServerLike>>,
): KernelPluginRow[] {
  const rows: KernelPluginRow[] = [];
  for (const [serverName, server] of Object.entries(servers)) {
    if (server.enabled === false) continue;
    rows.push({
      id: `mcp-${serverName}`,
      name: "@deepseek-ai/dsh-mcp-client",
      config: { serverName, ...mcpTransportConfig(server) },
    });
  }
  return rows;
}

/** Knorvia MCP 配置里本包要消费的字段子集；不引入配置模块依赖，保持单向。 */
export interface KernelMcpServerLike {
  readonly type?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
  readonly url?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly enabled?: boolean;
}

/** 把一份服务器配置翻成 DSH 的 transport 字段；只搬运，不改语义。 */
function mcpTransportConfig(server: KernelMcpServerLike): Record<string, unknown> {
  if (server.url !== undefined) {
    const transport: Record<string, unknown> = { transport: "streamable-http", url: server.url };
    if (server.headers !== undefined) transport.headers = { ...server.headers };
    return transport;
  }
  const transport: Record<string, unknown> = { transport: "stdio" };
  if (server.command !== undefined) transport.command = server.command;
  if (server.args !== undefined) transport.args = [...server.args];
  if (server.env !== undefined) transport.env = { ...server.env };
  if (server.cwd !== undefined) transport.cwd = server.cwd;
  return transport;
}
