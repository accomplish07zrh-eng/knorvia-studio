// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// 上下文来源端口 —— 宿主事实与用户指令的采集边界
// ════════════════════════════════════════════════════════════
// 每次开新会话或重渲染提示词，都要先把「我现在处在什么环境」拼出来：工作目录、shell、平台、Git 状态、
// 工程类型，以及用户写在各级指令文件里的内容。这些读数全都属于宿主，core 这侧不该自己去读文件或探测
// 系统；本文件定义请求什么、回来什么，以及读不到时如何报告。

// 所有权：快照由端口实现采集并组装，调用方只消费。局部失败（某个文件读不动、某段探测失败）不抛错，
// 而是随快照一起用 diagnostics 报告，不让一次小问题带走整份上下文。

// 章节：一 环境事实 · 二 项目识别 · 三 用户指令 · 四 请求与快照 · 五 端口本体

import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";

// ── 一、环境事实：一次采集里的机器与目录读数 ─────────────────────────

/** 宿主侧的环境快照。开头的五项每次都必须给出；Git 相关的读数只在目录确实是仓库时出现，字段缺席即 「不是仓库或没读到」，不要拿空字符串顶替。这里只装宿主采集到的事实：模型与会话属于执行期信息， 得由当前模型步骤在渲染提示词时自己补上，不要混进这份快照。 */
export interface EnvInfo {
  cwd: string;
  platform: string;
  shell: string;
  osVersion: string;
  nodeVersion: string;
  isGitRepository?: boolean;
  gitBranch?: string;
  gitMainBranch?: string;
  gitUser?: string;
  gitStatus?: "clean" | "dirty" | "not_repo";
  gitStatusLines?: string[];
  recentCommits?: string[];
}

// ── 二、项目识别：从目录里的标记文件读出工程类型 ─────────────────────

/** 识别出的工程类型；认不出来时取 unknown，而不是让字段缺席。 */
export type ProjectType = "node" | "python" | "rust" | "go" | "java" | "unknown";

/** 该工程实际使用的包管理器；识别不出就整个字段缺席。 */
export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/** 目录级工程画像：类型必答，包管理器、脚本清单与构建标记文件按识别结果出现或缺席。 */
export interface ProjectContext {
  type: ProjectType;
  packageManager?: PackageManager;
  scripts?: Record<string, string>;
  buildFiles?: string[];
}

// ── 三、用户指令：从哪一级文件读到了什么 ─────────────────────────────

/** 指令文件的来源层级：用户级（跨项目通用）还是当前工作区级。 */
export type UserInstructionSourceScope = "user" | "workspace";

/** 采集指令时由调用方给出的限定条件：工作目录是起点，另外两项用来收窄搜索范围。 */
export interface UserInstructionsOptions {
  workingDirectory: string;
  projectRoot?: string;
  priorityFiles?: string[];
  maxBytes?: number;
}

/** 单个来源文件的解析结果：内容与体积读数成对给出，truncated 说明是否在 maxBytes 处被截断。 */
export interface ResolvedUserInstructionSource {
  scope: UserInstructionSourceScope;
  filePath: string;
  fileName: string;
  content: string;
  bytesRead: number;
  sizeBytes: number;
  truncated: boolean;
}

/** 合并后的用户指令。顶层字段记录主文件（优先级最高的那一份）的读数，sources 保留全部来源的逐条 明细；实现没有做逐条拆分时 sources 可以整体缺席，此时调用方只应相信顶层字段。 */
export interface ResolvedUserInstructions {
  filePath: string;
  fileName: string;
  content: string;
  bytesRead: number;
  sizeBytes: number;
  truncated: boolean;
  sources?: ResolvedUserInstructionSource[];
}

// ── 四、请求与快照：一次采集的进出 ───────────────────────────────────

/** 一次采集的入参。envInfo、userInstructions、projectContext、currentDate 都允许调用方预先提供： 已经拿到手的读数不必重采，缺的部分由实现补齐；workingDirectory 是唯一必填项。 */
export interface ContextSourceRequest {
  workingDirectory: string;
  currentDate?: string;
  effectiveShellDisplayName?: string;
  envInfo?: EnvInfo;
  userInstructions?: UserInstructionsOptions;
  projectContext?: ProjectContext;
  trace?: TraceContext;
}

/** 采集过程中的非致命问题：哪个文件读不动、哪段探测失败，附带可读的说明与相关路径。 */
export interface ContextSourceDiagnostic {
  code: string;
  message: string;
  path?: string;
}

/** 采集结果快照。workingDirectory 与 envInfo 必有（至少是退到最低限度的读数），其余部分读不到就 缺席；diagnostics 即使一条都没有也照样给出，免得调用方在「没问题」与「没这一项」之间猜。 */
export interface ContextSourceSnapshot {
  workingDirectory: string;
  envInfo: EnvInfo;
  currentDate?: string;
  userInstructions?: ResolvedUserInstructions;
  projectContext?: ProjectContext;
  diagnostics: ContextSourceDiagnostic[];
}

// ── 五、端口本体：调用选项与唯一入口 ─────────────────────────────────

/** 调用侧的运行时开关：signal 负责取消，context 承载本次调用的执行上下文（含 trace）。 */
export interface ContextSourceResolveOptions {
  signal?: AbortSignal;
  context?: ExecutionContext;
}

/** 上下文采集能力的完整形状：一次调用产出一份快照，局部失败走 diagnostics 而不是异常。 */
export interface ContextSourcePort {
  resolveContextSources(
    request: ContextSourceRequest,
    options?: ContextSourceResolveOptions,
  ): Promise<ContextSourceSnapshot>;
}
