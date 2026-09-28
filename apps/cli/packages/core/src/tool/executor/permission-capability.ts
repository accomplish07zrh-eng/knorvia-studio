// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ModelToolSideEffectScope } from "@knorvia/contracts";
import type { PermissionToolCapability } from "../../permission/service.js";
import type { ToolEntry, ToolRuntimePermissionCapabilityContext } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";

/** Registration facts and per-call overrides form a shallow overlay, never a shared cache. */
export function resolveRuntimePermissionCapability(
  entry: ToolEntry,
  input: unknown,
  context: ToolRuntimePermissionCapabilityContext,
): PermissionToolCapability {
  const override = entry.resolvePermissionCapability?.(input, context);
  let combined: Omit<PermissionToolCapability, "permission"> & {
    permission?: Partial<NonNullable<PermissionToolCapability["permission"]>>;
  } = {};
  for (const layer of [entry.metadata, override]) combined = { ...combined, ...layer };
  // 可信组属于注册来源，运行时覆盖不能自行取得该身份。
  return {
    ...combined,
    permissionCapabilityGroup: entry.permissionCapabilityGroup,
    permission: { ...entry.permission, ...override?.permission },
  };
}

export function resolveToolCallCapabilityFlags(
  deps: ToolExecutorDeps,
  entry: ToolEntry,
  input: unknown,
): { readOnly?: boolean; sideEffectScope?: ModelToolSideEffectScope } {
  const context = resolveRuntimePermissionContext(deps);
  const resolved = resolveRuntimePermissionCapability(entry, input, context);
  return {
    readOnly: resolved.readOnly,
    // 与 Service 的显式范围优先级一致；只取顶层会漏报运行时嵌套的 workspace 写入。
    sideEffectScope: resolved.permission?.sideEffectScope ?? resolved.sideEffectScope,
  };
}

export function resolveRuntimePermissionContext(
  deps: ToolExecutorDeps,
): ToolRuntimePermissionCapabilityContext {
  const runtimeScope = deps.runtimeScope;
  const workingDirectory = deps.getWorkingDirectory();
  const workspaceRoot = deps.getWorkspaceRoot();
  return { runtimeScope, workingDirectory, workspaceRoot };
}
