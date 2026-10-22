// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// Hook 环境叠加与变量展开（B2 的 6 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B2。
//
// 设计要点：
//   ① 环境是**整体 `set`**（不是增量 patch）—— 调用方按 `set` 整体注入子进程，
//      避免「父进程环境残留」影响 Hook 行为。
//   ② 变量展开是**纯函数**：相同入参恒等输出，不读 `process.env`。
//   ③ skill 变量**必须报错**：展开成空串会把「缺少上下文」变成一条错误命令，
//      那是比报错更糟的静默故障。
import type { HookEventName } from "@knorvia/contracts";

/** 本模块依赖的输入形状（只取与环境/展开有关的字段）。 */
export interface HookEnvInputLike {
  readonly hookEventName: HookEventName;
  readonly sessionId: string;
  readonly cwd?: string;
  readonly workspacePath?: string;
}

/** 插件上下文：有它时额外注入 6 个变量。 */
export interface HookPluginContextLike {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly dataPath: string;
}

/**
 * skill 变量：在 Hook 运行期**没有语义**（只有 skill 执行时才有）。
 *
 * 为什么单独列出：它们必须抛错而不是展开为空串。
 */
const SKILL_VARIABLES: readonly string[] = ["CLAUDE_SKILL_DIR", "KNORVIA_SKILL_DIR"];

/**
 * 可展开的变量名（B2.3）。
 *
 * 用正则一次性匹配所有已知变量：未识别的 `${...}` 不会被匹配，
 * 因而天然「原样保留」—— 不需要额外的白名单判断。
 */
const VARIABLE_PATTERN =
  /\$\{(CLAUDE_CODE_SESSION_ID|CLAUDE_PLUGIN_DATA|CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR|CLAUDE_SESSION_ID|CLAUDE_SKILL_DIR|KNORVIA_PLUGIN_DATA|KNORVIA_PLUGIN_ROOT|KNORVIA_PROJECT_DIR|KNORVIA_SESSION_ID|KNORVIA_SKILL_DIR)\}/gu;

/** 展开时缺少 skill 上下文：这是**配置错误**，不是运行时故障。 */
export class HookVariableError extends Error {
  readonly code = "hook_variable_requires_skill_context";
  readonly recoverable = true;
  constructor(
    readonly variable: string,
    readonly hookEventName: string,
  ) {
    super(`Hook variable requires a skill context: ${variable}`);
    this.name = "HookVariableError";
  }
}

/** 始终注入的 5 个变量（B2.1）。 */
function baseEnvironment(
  input: HookEnvInputLike,
  workingDirectory: string,
): Record<string, string> {
  // 项目目录：优先输入里的 cwd，否则用调用方给的工作目录。
  const project = input.cwd || workingDirectory;
  return {
    CLAUDE_CODE_SESSION_ID: input.sessionId,
    CLAUDE_SESSION_ID: input.sessionId,
    KNORVIA_SESSION_ID: input.sessionId,
    CLAUDE_PROJECT_DIR: project,
    KNORVIA_PROJECT_DIR: project,
  };
}

/** 有插件上下文时的 6 个变量（B2.2）。 */
function pluginEnvironment(plugin: HookPluginContextLike): Record<string, string> {
  return {
    CLAUDE_PLUGIN_DATA: plugin.dataPath,
    CLAUDE_PLUGIN_ROOT: plugin.rootPath,
    KNORVIA_PLUGIN_DATA: plugin.dataPath,
    KNORVIA_PLUGIN_ROOT: plugin.rootPath,
    KNORVIA_PLUGIN_ID: plugin.id,
    KNORVIA_PLUGIN_NAME: plugin.name,
  };
}

/**
 * 构造注入子进程的环境覆盖。
 *
 * 返回的 `set` 是**完整**的环境覆盖集合，不是增量 patch ——
 * 调用方应把它作为子进程的环境（叠加在基础环境之上）。
 */
export function createHookEnvOverlay(
  plugin: HookPluginContextLike | undefined,
  input: HookEnvInputLike,
  workingDirectory: string,
): { set: Record<string, string> } {
  const base = baseEnvironment(input, workingDirectory);
  const set = plugin === undefined ? base : { ...base, ...pluginEnvironment(plugin) };
  return { set };
}

/** 变量名 → 值 的替换表（与 `createHookEnvOverlay` 用同一套来源，避免两处推导漂移）。 */
function replacementTable(
  plugin: HookPluginContextLike | undefined,
  input: HookEnvInputLike,
  workingDirectory: string,
): Record<string, string> {
  // 直接复用 overlay 的实现：这样「环境里有什么」与「能展开什么」永远一致。
  return createHookEnvOverlay(plugin, input, workingDirectory).set;
}

/**
 * 展开命令/参数里的 `${VAR}`（B2.3–B2.5）。
 *
 * 行为：
 *   · 已知变量且有值 → 替换
 *   · skill 变量 → **抛 `HookVariableError`**（不得静默展开为空串）
 *   · 未识别的 `${...}` → 原样保留（正则不匹配它们）
 *   · 同一字符串里的多个变量 → 全部替换
 *
 * 是纯函数：不读 `process.env`，相同入参恒等输出。
 */
export function expandHookVariables(
  value: string,
  plugin: HookPluginContextLike | undefined,
  input: HookEnvInputLike,
  workingDirectory: string,
): string {
  const table = replacementTable(plugin, input, workingDirectory);

  return value.replace(VARIABLE_PATTERN, (match: string, key: string): string => {
    if (SKILL_VARIABLES.includes(key)) {
      throw new HookVariableError(key, input.hookEventName);
    }
    return table[key] ?? match;
  });
}
