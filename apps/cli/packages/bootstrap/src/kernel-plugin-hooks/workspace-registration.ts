// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// workspace Hook 登记与插入顺序（B6 的 5 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B6。
//
// 背景：workspace 里的 Hook（项目级）与用户配置的 Hook 在同一个事件下都要执行，
// 而**顺序有讲究**：项目 Hook 应当先于「用户/内部配置」的 Hook，
// 但**不能插到用户 Hook 之前** —— 因为用户显式配置的 Hook 优先级最高。
//
// 设计要点：
//   ① 只有**同时**提供 admission 与 snapshot 才产生 workspace 项（B6.1）
//   ② 插入位置 = 「第一个 sourceKind !== "user"」的下标之前（B6.4）
//   ③ 同一事件内 workspace 项**保持快照顺序**（B6.5）
import type { HookEventName } from "@knorvia/contracts";
import type { HookCommandConfig } from "./hook-exec.js";
import type { RegisteredHook } from "./hook-runner.js";

/** 快照里的一条 Hook 声明。 */
export interface WorkspaceHookSnapshotEntry {
  readonly event: HookEventName;
  readonly matcher?: string;
  readonly reviewItemId: string;
  /** 该条的解析后超时（B6.2）。 */
  readonly resolvedTimeoutMs: number;
  /** 该条的解析后输出上限（B6.2）。 */
  readonly resolvedMaxOutputBytes: number;
  readonly hook: HookCommandConfig;
  /** 快照的 sourceFiles 下标；用于取 canonicalPath（B6.3）。 */
  readonly sourceFileIndex?: number;
  readonly statusMessage?: string;
}

/** 快照（B6.2）。 */
export interface WorkspaceHookSnapshot {
  readonly entries: readonly WorkspaceHookSnapshotEntry[];
  readonly sourceFiles?: readonly { readonly canonicalPath?: string }[];
}

/** admission 判定（B6.2）：返回 true 表示允许该条进入运行时。 */
export type WorkspaceHookAdmission = (request: {
  readonly hookDeclarationDigest: string;
  readonly reviewItemId: string;
}) => boolean;

/** workspace 登记的入参。 */
export interface WorkspaceRegistrationInput {
  readonly admission: WorkspaceHookAdmission;
  readonly snapshot: WorkspaceHookSnapshot;
}

/**
 * 把快照条目转成登记项（B6.2 / B6.3）。
 *
 * 每条都先过 admission —— 未通过的不产生登记项（等于「不执行」）。
 */
export function registerWorkspaceHooks(
  input: WorkspaceRegistrationInput | undefined,
): readonly RegisteredHook[] {
  // B6.1：两者缺一就不产生 workspace 项。
  if (input === undefined) return [];

  const registered: RegisteredHook[] = [];
  for (const entry of input.snapshot.entries) {
    // admission 决定这一条是否被允许（如「用户还没批准」→ false）。
    const digest = hookDeclarationDigestOf(entry);
    if (!input.admission({ hookDeclarationDigest: digest, reviewItemId: entry.reviewItemId })) {
      continue;
    }

    // B6.3：source.path 取快照 sourceFiles 的 canonicalPath（存在时）。
    const sourcePath =
      entry.sourceFileIndex === undefined
        ? undefined
        : input.snapshot.sourceFiles?.[entry.sourceFileIndex]?.canonicalPath;

    registered.push({
      hook: entry.hook,
      // B6.2：source = project.<reviewItemId>
      source: `project.${entry.reviewItemId}`,
      sourceKind: "project",
      ...(entry.matcher === undefined ? {} : { matcher: entry.matcher }),
      // B6.2：timeout / maxOutputBytes 用**解析后**的值（不是配置里的）
      timeoutMs: entry.resolvedTimeoutMs,
      maxOutputBytes: entry.resolvedMaxOutputBytes,
      ...(sourcePath === undefined ? {} : { sourcePath }),
      ...(entry.statusMessage === undefined ? {} : { statusMessage: entry.statusMessage }),
    });
  }
  return registered;
}

/**
 * 计算一条声明的 digest（供 admission 与 B11 的撤销集合使用）。
 *
 * 用「事件 + matcher + reviewItemId + 命令形态」拼成稳定字符串 ——
 * 因为 digest 的作用是「识别同一条声明」，所以必须对「声明内容」敏感、
 * 对「无关字段」不敏感。
 */
export function hookDeclarationDigestOf(entry: WorkspaceHookSnapshotEntry): string {
  const parts = [
    entry.event,
    entry.matcher ?? "",
    entry.reviewItemId,
    entry.hook.type,
    entry.hook.command,
    ...(entry.hook.type === "process" ? (entry.hook.args ?? []) : []),
  ];
  return parts.join("\u0000");
}

/**
 * 把 workspace 项按 B6.4 的规则插入到配置项序列里。
 *
 * 规则（逐事件）：
 *   找到配置项中**第一个 `sourceKind !== "user"`** 的下标；
 *   把该事件的 workspace 项插到它**之前**；没有这样的下标则追加到末尾。
 *
 * 语义：**项目 Hook 先于用户/内部配置 Hook，但不会插到用户 Hook 之前。**
 *
 * B6.5：同一事件内 workspace 项的相互顺序保持快照顺序 ——
 * 因为 `registerWorkspaceHooks` 按 entries 顺序产出，而这里按原顺序插入。
 */
export function mergeWorkspaceHooks(
  configured: readonly RegisteredHook[],
  workspace: readonly RegisteredHook[],
  eventOf: (hook: RegisteredHook) => HookEventName,
): readonly RegisteredHook[] {
  if (workspace.length === 0) return configured;

  // 按事件分组，同时保持各自的相对顺序。
  const workspaceByEvent = new Map<HookEventName, RegisteredHook[]>();
  for (const hook of workspace) {
    const event = eventOf(hook);
    const bucket = workspaceByEvent.get(event);
    if (bucket === undefined) workspaceByEvent.set(event, [hook]);
    else bucket.push(hook);
  }

  const result: RegisteredHook[] = [];
  const events = new Set<HookEventName>([...configured.map(eventOf), ...workspaceByEvent.keys()]);

  for (const event of events) {
    const configuredOfEvent = configured.filter((hook) => eventOf(hook) === event);
    const workspaceOfEvent = workspaceByEvent.get(event) ?? [];

    // 找第一个非 user 的配置项下标。
    const insertAt = configuredOfEvent.findIndex((hook) => hook.sourceKind !== "user");

    if (insertAt === -1) {
      // 没有非 user 项 → 追加到该事件的末尾。
      result.push(...configuredOfEvent, ...workspaceOfEvent);
    } else {
      // 插到第一个非 user 项**之前**。
      result.push(
        ...configuredOfEvent.slice(0, insertAt),
        ...workspaceOfEvent,
        ...configuredOfEvent.slice(insertAt),
      );
    }
  }
  return result;
}
