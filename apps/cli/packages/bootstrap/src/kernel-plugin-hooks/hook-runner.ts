// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// Hook 运行器：把配置登记成「该事件要跑哪些 Hook」，并按顺序执行、聚合裁决。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B5（配置登记）+ B6（workspace 登记与插入顺序）。
//
// 设计要点：
//   ① **登记（B5/B6）与执行（B7/B8）分离**：登记是纯数据转换（可单独测），
//      执行才碰子进程。这样「配置长什么样」与「怎么跑」可以各自演进。
//   ② **matcher 匹配**：只对带 toolName 的事件生效；matcher 为空表示「全匹配」。
//   ③ **首个阻断即短路**（waterfall 语义）：避免后续 Hook 在已知被阻断时仍跑子进程。
import type { HookEventName } from "@knorvia/contracts";
import type { ExecutionPort } from "@knorvia/contracts";
import type { HookCommandConfig, HookExecutionOutcome } from "./hook-exec.js";
import { runHook } from "./hook-exec.js";
import type { HookParseResult } from "./hook-parse.js";
import { parseHookOutcome } from "./hook-parse.js";
import type { HookInputLike } from "./hook-input.js";
import type { HookPluginContextLike } from "./hook-env.js";
import type { HookTempDirectoryPort } from "./temp-directory.js";
import type { HookVerdict } from "./verdict.js";
import { verdictFromPermissionDecision } from "./verdict.js";

/** 一条已登记的 Hook：配置 + 来源标识 + 该条的有效限制。 */
export interface RegisteredHook {
  readonly hook: HookCommandConfig;
  /** 来源标识（B5.3）：`config.<event>.<matcherIndex>.<hookIndex>` 等。 */
  readonly source: string;
  /** 来源类别（B5.6）：plugin / project / user / internal。 */
  readonly sourceKind: "plugin" | "project" | "user" | "internal";
  /** matcher：空表示全匹配（只对带 toolName 的事件生效）。 */
  readonly matcher?: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  /** 来源文件的规范路径（B6.3；workspace 项才可能有）。 */
  readonly sourcePath?: string;
  /** 该条的状态说明（B6.3；用于 UI 展示「为什么没运行」）。 */
  readonly statusMessage?: string;
}

/** 一个事件下的一条 matcher 配置。 */
export interface HookMatcherConfigLike {
  readonly matcher?: string;
  readonly hooks: readonly (HookCommandConfig & { readonly enabled?: boolean })[];
}

/** 一个事件的配置。 */
export interface HookEventConfigLike {
  readonly matchers?: readonly HookMatcherConfigLike[];
}

/** 配置面（只列本模块用到的字段）。 */
export interface HooksConfigLike {
  readonly enabled?: boolean;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly events?: Partial<Record<HookEventName, HookEventConfigLike>>;
}

/**
 * 登记配置来源的 Hook（B5）。
 *
 * 跳过规则：
 *   · `config.enabled === false` → 整个配置来源为空（B5.1）
 *   · `hook.enabled === false` → 该条跳过（B5.2）
 */
export function registerConfiguredHooks(
  config: HooksConfigLike,
  event: HookEventName,
): readonly RegisteredHook[] {
  if (config.enabled === false) return [];

  const eventConfig = config.events?.[event];
  if (eventConfig?.matchers === undefined) return [];

  const registered: RegisteredHook[] = [];
  eventConfig.matchers.forEach((matcherConfig, matcherIndex) => {
    matcherConfig.hooks.forEach((hook, hookIndex) => {
      if (hook.enabled === false) return;

      // B5.4：`async === true` 只在 command 类型下有意义；process 一律前景。
      // 而本运行器**只做前景执行**（后台执行由上层调度），所以这里不区分。
      registered.push({
        hook,
        source: `config.${event}.${matcherIndex}.${hookIndex}`,
        sourceKind: "internal",
        ...(matcherConfig.matcher === undefined ? {} : { matcher: matcherConfig.matcher }),
        // B5.5：单条超时 = 该 hook 的有效超时；未设置时用 config.timeoutMs。
        timeoutMs: config.timeoutMs,
        maxOutputBytes: config.maxOutputBytes,
      });
    });
  });

  return registered;
}

/**
 * 判断 matcher 是否匹配当前工具名。
 *
 * 规则：
 *   · 无 matcher → 全匹配（`true`）
 *   · 有 matcher 但输入没有 toolName → 不匹配（matcher 只对工具类事件有意义）
 *   · 有 matcher 且有 toolName → 精确相等才算匹配
 *
 * ⚠️ 旧 Hook 生态的 matcher 支持正则（形如 `Bash|Write`）。本实现**按字面量精确匹配**，
 * 这是已知差异（记入 `known-differences.md` 的待补项）。
 */
export function matcherMatches(matcher: string | undefined, toolName: string | undefined): boolean {
  if (matcher === undefined || matcher.length === 0) return true;
  if (toolName === undefined) return false;
  return matcher === toolName;
}

/** 一次 Hook 执行的完整上下文。 */
export interface HookRunnerContext {
  readonly execution: ExecutionPort;
  readonly tempDirectory: HookTempDirectoryPort;
  readonly workingDirectory: string;
  readonly plugin?: HookPluginContextLike;
  readonly signal?: AbortSignal;
}

/**
 * 依次执行某事件的全部匹配 Hook，返回首个产生阻断的裁决。
 *
 * 聚合规则（对应 `behavior.md` §2.1 的 waterfall 语义）：
 *   · 按登记顺序执行
 *   · 首个 `deny` 立即返回（**短路**，后续 Hook 不再跑子进程）
 *   · 都没有阻断时返回「无意见」，让下游继续
 */
export async function runEventHooks(
  hooks: readonly RegisteredHook[],
  input: HookInputLike,
  context: HookRunnerContext,
): Promise<HookVerdict> {
  for (const registered of hooks) {
    // matcher 匹配：不匹配就跳过（不跑子进程）。
    if (!matcherMatches(registered.matcher, input.toolName)) continue;

    let outcome: HookExecutionOutcome;
    try {
      outcome = await runHook(
        {
          hook: registered.hook,
          input,
          ...(context.plugin === undefined ? {} : { plugin: context.plugin }),
          workingDirectory: context.workingDirectory,
          timeoutMs: registered.timeoutMs,
          maxOutputBytes: registered.maxOutputBytes,
          ...(context.signal === undefined ? {} : { signal: context.signal }),
        },
        context.execution,
        context.tempDirectory,
      );
    } catch {
      // Hook 的**基础设施失败**（起不来、超时）不应伪装成「用户拒绝」——
      // 按「无意见」处理并继续下一个（符合「Hook 失败不改变主流程语义」）。
      continue;
    }

    let parsed: HookParseResult;
    try {
      parsed = parseHookOutcome(outcome, input.hookEventName);
    } catch {
      // 输出解析失败同样是 Hook 自身问题，不当作拒绝。
      continue;
    }

    const decision = parsed.output?.hookSpecificOutput?.permissionDecision;
    const reason =
      parsed.output?.hookSpecificOutput?.permissionDecisionReason ?? parsed.output?.reason;

    const verdict = verdictFromPermissionDecision(decision, reason);
    if (verdict.kind !== "no-opinion") return verdict;
  }

  return { kind: "no-opinion" };
}
