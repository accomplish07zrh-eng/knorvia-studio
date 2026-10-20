// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 原子替换的路径与标记协议。目标文件旁边固定放三种伴生条目：标记（记录事务与所属者）、
// 备份（原内容的落点）、暂存前缀（本次事务的临时条目）。标记有两种格式版本，第 1 版只有
// 暂存名，第 2 版起带上事务号、所属者与模式，解码时按版本分流校验。
// 所有「路径是否仍在父目录内」的判断都在本模块收口，调用方不要自己拼相对路径。

import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  AtomicMarker,
  AtomicPaths,
  LegacyAtomicMarker,
  ReadableAtomicMarker,
} from "./atomic-protocol-types.js";

export type {
  AtomicMarker,
  AtomicPaths,
  LegacyAtomicMarker,
  ReadableAtomicMarker,
} from "./atomic-protocol-types.js";

/** 伴生条目的命名骨架：都是「点 + 目标名 + 后缀」，后缀决定用途。 */
const SIDECAR_SUFFIX = {
  marker: ".transaction.json",
  backup: ".backup",
  stage: ".stage-",
} as const;

/** 标记格式版本：1 只有暂存名，2 起带事务与所属者信息。 */
const MARKER_VERSION = { legacy: 1, current: 2 } as const;

/** 第 2 版允许的写入模式：协调式要拿宿主授权，独立式自己写。 */
const MARKER_MODES = ["coordinated", "standalone"] as const;

/** 取消语义统一的错误名，上层按名字分流取消与真实失败。 */
const ABORT_ERROR_NAME = "AbortError";

type Mode = (typeof MARKER_MODES)[number];

/** 普通对象判定：数组与 null 都不算。 */
function isPlainRecord(candidate: unknown): candidate is Record<string, unknown> {
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate);
}

/** 正安全整数：用来校验所属者 pid，0 与负数都不合法。 */
function isPositiveSafeInteger(candidate: unknown): candidate is number {
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0;
}

/** 模式取值校验。 */
function isMode(candidate: unknown): candidate is Mode {
  return MARKER_MODES.includes(candidate as Mode);
}

/** 给目标路径配齐三种伴生条目。目标先规范化，避免相对路径混进来。 */
export function pathsForAtomicTarget(target: string): AtomicPaths {
  const canonical = resolve(target);
  const parent = dirname(canonical);
  const name = basename(canonical);
  const beside = (suffix: string): string => join(parent, `.${name}${suffix}`);
  return {
    target: canonical,
    parent,
    marker: beside(SIDECAR_SUFFIX.marker),
    backup: beside(SIDECAR_SUFFIX.backup),
    stagePrefix: `.${name}${SIDECAR_SUFFIX.stage}`,
  };
}

/** 第 2 版标记的逐字段校验：任一字段不符即整条标记作废（返回 false）。 */
function isCurrentMarker(value: Record<string, unknown>): boolean {
  const shaped =
    typeof value.transactionId === "string" &&
    typeof value.ownerId === "string" &&
    isPositiveSafeInteger(value.ownerPid) &&
    typeof value.hadTarget === "boolean" &&
    isMode(value.mode);
  const authorityOk = value.authorityPath === undefined || typeof value.authorityPath === "string";
  return shaped && authorityOk;
}

/** 把已通过校验的第 2 版标记组装成可读形态（可选字段仅在存在时出现）。 */
function freezeCurrentMarker(value: Record<string, unknown>): ReadableAtomicMarker {
  const base = {
    version: MARKER_VERSION.current,
    stageName: value.stageName as string,
    transactionId: value.transactionId as string,
    ownerId: value.ownerId as string,
    ownerPid: value.ownerPid as number,
    hadTarget: value.hadTarget as boolean,
    mode: value.mode as Mode,
  };
  return typeof value.authorityPath === "string"
    ? { ...base, authorityPath: value.authorityPath }
    : base;
}

/** 标记解码：先按版本分流，未知版本与残缺字段都按「读不出」处理。 */
export function decodeAtomicMarker(value: unknown): ReadableAtomicMarker | undefined {
  if (!isPlainRecord(value) || typeof value.stageName !== "string") return undefined;
  if (value.version === MARKER_VERSION.legacy) {
    return { version: MARKER_VERSION.legacy, stageName: value.stageName };
  }
  if (value.version !== MARKER_VERSION.current || !isCurrentMarker(value)) return undefined;
  return freezeCurrentMarker(value);
}

/**
 * 暂存条目是否归本次事务所有：必须带本目标的前缀且多出内容，并且不能是
 * 带分隔符、绝对路径或含 NUL 的名字；最后再确认解析回父目录后仍在父目录内。
 */
export function ownedStagePath(paths: AtomicPaths, stageName: string): string | undefined {
  const carriesPrefix =
    stageName.startsWith(paths.stagePrefix) && stageName.length > paths.stagePrefix.length;
  const isBareName =
    !stageName.includes("/") &&
    !stageName.includes("\\") &&
    !stageName.includes("\0") &&
    !isAbsolute(stageName) &&
    basename(stageName) === stageName;
  if (!carriesPrefix || !isBareName) return undefined;
  const stage = resolve(paths.parent, stageName);
  const inside = relative(paths.parent, stage);
  const escapes =
    inside.length === 0 ||
    inside === ".." ||
    inside.startsWith("../") ||
    inside.startsWith("..\\") ||
    isAbsolute(inside);
  return escapes ? undefined : stage;
}

/**
 * 宿主授权里是否已记录本事务的结论。授权对象可能是嵌套结构，按深度优先走一遍，
 * 命中 cacheTransactionId 即返回；用 visited 集合防环。
 */
export function authorityHasGeneration(value: unknown, transactionId: string): boolean {
  const pending: unknown[] = [value];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if ((current as Record<string, unknown>).cacheTransactionId === transactionId) return true;
    pending.push(...Object.values(current as Record<string, unknown>));
  }
  return false;
}

/** 取消检查：已中止时抛出带标准错误名的错误，便于上层按名分流。 */
export function assertAtomicNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const cancelled = new Error("Plugin operation cancelled");
  cancelled.name = ABORT_ERROR_NAME;
  throw cancelled;
}

/** 目标正被另一个事务占用时的固定错误。 */
export function atomicBusyError(target: string): Error {
  return new Error(`Atomic directory activation is already active: ${target}`);
}
