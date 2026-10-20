// SPDX-License-Identifier: Apache-2.0
// v1 固定组合的唯一事实源：顺序、包名与 config 均按合同 README §三。

import { join } from "node:path";
import { type KernelPluginModuleIds, kernelPluginModuleIds } from "./builtins-modules.js";
import { type KernelMcpServerLike, createBuiltinsRows, createMcpRows } from "./builtins-rows.js";
import { KERNEL_PERSONA_PREFIX } from "./constants.js";

export interface KernelPluginRow {
  readonly id: string;
  readonly name: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly disabled?: boolean;
}

export const KERNEL_PLUGIN_ROWS: readonly KernelPluginRow[] = [
  { id: "timer", name: "@deepseek-ai/cordis-plugin-timer" },
  { id: "llm", name: "@deepseek-ai/dsh-llm" },
  { id: "sessions", name: "@deepseek-ai/dsh-session" },
  {
    id: "session-persistence",
    name: "@deepseek-ai/dsh-session-persistence-jsonl",
    config: { compression: "none" },
  },
  { id: "session-projection", name: "@deepseek-ai/dsh-session-projection" },
  {
    id: "system-prompt",
    name: "@deepseek-ai/dsh-system-prompt",
    config: {
      includeHarnessIdentity: false,
      // 修正二：模型需要工作目录、平台、shell、日期与时区才可能判断自己在哪、
      // 该用什么命令。关闭它会让所有 context 贡献被抑制（known-differences D2）。
      includeRuntimeContext: true,
      personaPrefix: KERNEL_PERSONA_PREFIX,
    },
  },
  { id: "tools", name: "@deepseek-ai/dsh-tools" },
  { id: "agents", name: "@deepseek-ai/dsh-agent" },
  { id: "agent-loop", name: "@deepseek-ai/dsh-agent-loop", config: { agents: [] } },
  { id: "invariants", name: "@deepseek-ai/dsh-invariants" },
  { id: "session-invariant", name: "@deepseek-ai/dsh-session/invariant" },
  { id: "agent-invariant", name: "@deepseek-ai/dsh-agent/invariant" },
  { id: "scope-invariant", name: "@deepseek-ai/dsh-scope/invariant" },
  { id: "agent-loop-invariant", name: "@deepseek-ai/dsh-agent-loop/invariant" },
  {
    id: "agent-instructions",
    name: "@deepseek-ai/dsh-agent-instructions",
    config: { maxBytes: 65536 },
  },
  { id: "skill", name: "@deepseek-ai/dsh-skill" },
  {
    id: "skill-filesystem",
    name: "@deepseek-ai/dsh-skill-filesystem",
    config: { includeDefaultRoots: false, watch: false },
  },
  { id: "mcp-resources", name: "@deepseek-ai/dsh-mcp-resources" },
  { id: "llm-pi-ai", name: "@deepseek-ai/dsh-llm-pi-ai", config: { providers: {} } },
];

/**
 * 物化完整组合：底座 19 行 + 本包追加行。
 *
 * `kernel-dsh-00` 的 {@link KERNEL_PLUGIN_ROWS} 保持为**底座蓝图**不变（它的合同快照
 * 断言的是那 19 行）；本包的行由 `builtins-rows.ts` 提供，在这里接在底座之后。
 * 两条子路径仍然共用一个事实源：这里是唯一决定「最终挂什么」的地方。
 *
 * 入参全部可选是为了让调用方按需覆盖平台与模块地址；不传时按当前进程平台与
 * 本包自己的包名子路径解析，因此「只想知道最终组合长什么样」的调用方不必先算地址。
 *
 * @param dshHome - DSH 主目录，会话持久化与托管环境行要用它。
 * @param options.platform - 平台，决定 shell 执行器与 shell 工具用哪一支。
 * @param options.cwd - 启动 cwd；沙箱策略的 workspace-write 写边界取它。
 * @param options.moduleIds - 本包自有插件模块的可解析地址。
 * @param options.mcpServers - Knorvia MCP 配置；缺席表示不挂 MCP 客户端。
 * @returns 最终行清单，顺序确定。
 */
export function createKernelPluginRows(
  dshHome: string,
  options?: {
    readonly platform?: string;
    readonly cwd?: string;
    readonly moduleIds?: KernelPluginModuleIds;
    readonly mcpServers?: Readonly<Record<string, KernelMcpServerLike>>;
  },
): KernelPluginRow[] {
  const base = KERNEL_PLUGIN_ROWS.map((row) => {
    if (row.id !== "session-persistence") {
      return row.config === undefined ? { ...row } : { ...row, config: { ...row.config } };
    }
    return {
      ...row,
      config: { root: join(dshHome, "sessions"), ...row.config },
    };
  });

  const mcpRows = options?.mcpServers === undefined ? [] : createMcpRows(options.mcpServers);
  const builtins = createBuiltinsRows({
    platform: options?.platform ?? process.platform,
    workspaceRoot: options?.cwd ?? process.cwd(),
    moduleIds: options?.moduleIds ?? kernelPluginModuleIds(),
  });
  return [...base, ...builtins, ...mcpRows];
}
