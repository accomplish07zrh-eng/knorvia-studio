// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// Hook 执行描述元数据（B3 的 7 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B3。
//
// 用途：把一条 Hook 配置转成「UI 可展示的描述」——
// 用户需要看到「哪个 Hook、以什么方式、跑什么命令、来自哪里」。
//
// 设计要点：
//   ① **纯函数**：无副作用、幂等（B3.7）
//   ② `expandDisplayValue` 由调用方注入（B3.7：本函数不吞它的异常）
//   ③ 可选字段**只在有值时出现**（B3.6）—— 避免 UI 显示空占位
import { sanitizeHookDisplayText } from "./display-sanitize.js";

/** 可展示的 Hook 配置（比执行用的配置多带来源信息）。 */
export interface HookDisplaySource {
  readonly kind?: string;
  readonly path?: string;
}

export interface HookDisplayPlugin {
  readonly id: string;
  readonly name: string;
  readonly sourcePath?: string;
}

export interface HookDisplayConfig {
  readonly type: "command" | "process";
  readonly command: string;
  readonly args?: readonly string[];
  readonly async?: boolean;
  readonly plugin?: HookDisplayPlugin;
  readonly source?: HookDisplaySource;
  readonly statusMessage?: string;
}

/** 描述结果（B3 的全部字段）。 */
export interface HookExecutionDescriptor {
  readonly commandDisplay: string;
  readonly sourceKind: "plugin" | "project" | "user" | "internal";
  readonly clientVisible: boolean;
  readonly executionMode: "background" | "foreground";
  readonly executionType: "command" | "process";
  readonly timeoutMs: number;
  readonly pluginId?: string;
  readonly pluginName?: string;
  readonly sourcePath?: string;
  readonly statusMessage?: string;
}

/**
 * 需要加引号的片段判定（B3.1）。
 *
 * 只有整体匹配安全字符集的片段才原样输出；否则用 `JSON.stringify` 加引号。
 * 安全字符集：字母数字与 `_ ./:@%+=,-`。
 */
const SAFE_FRAGMENT = /^[A-Za-z0-9_./:@%+=,-]+$/u;

/** 把一段命令片段渲染成可展示形态。 */
function renderFragment(fragment: string): string {
  return SAFE_FRAGMENT.test(fragment) ? fragment : JSON.stringify(fragment);
}

/**
 * 构造 Hook 的执行描述（B3）。
 *
 * @param hook 待描述的 Hook 配置
 * @param timeoutMs 该条的有效超时（**不被 hook 里的值覆盖**，B3.5）
 * @param expandDisplayValue 可选的变量展开函数（默认恒等）；
 *        它抛错时**本函数不吞**，由调用方兜底（B3.7）
 */
export function createHookExecutionDescriptor(
  hook: HookDisplayConfig,
  timeoutMs: number,
  expandDisplayValue: (value: string) => string = (value) => value,
): HookExecutionDescriptor {
  // B3.1 commandDisplay：按类型渲染，最后整体脱敏（B4）。
  const rawCommand =
    hook.type === "process"
      ? [hook.command, ...(hook.args ?? [])]
          .map((fragment) => renderFragment(expandDisplayValue(fragment)))
          .join(" ")
      : expandDisplayValue(hook.command);

  const commandDisplay = sanitizeHookDisplayText(rawCommand);

  // B3.2 sourceKind：插件优先；否则看 source.kind；都没有则 internal。
  const sourceKind: HookExecutionDescriptor["sourceKind"] =
    hook.plugin !== undefined
      ? "plugin"
      : ((hook.source?.kind as HookExecutionDescriptor["sourceKind"] | undefined) ?? "internal");

  // B3.4 executionMode：只有 command + async 才是后台；process 一律前景。
  const executionMode: HookExecutionDescriptor["executionMode"] =
    hook.type === "command" && hook.async === true ? "background" : "foreground";

  // B3.6 可选字段只在有值时出现。
  const optional: {
    pluginId?: string;
    pluginName?: string;
    sourcePath?: string;
    statusMessage?: string;
  } = {};
  if (hook.plugin !== undefined) {
    optional.pluginId = hook.plugin.id;
    optional.pluginName = hook.plugin.name;
  }
  // sourcePath：插件优先，其次 hook.source.path（B3.6）。
  const sourcePath = hook.plugin?.sourcePath ?? hook.source?.path;
  if (sourcePath !== undefined) optional.sourcePath = sourcePath;
  if (hook.statusMessage !== undefined) optional.statusMessage = hook.statusMessage;

  return {
    commandDisplay,
    sourceKind,
    // B3.3
    clientVisible: sourceKind !== "internal",
    executionMode,
    // B3.5
    executionType: hook.type,
    timeoutMs,
    ...optional,
  };
}
