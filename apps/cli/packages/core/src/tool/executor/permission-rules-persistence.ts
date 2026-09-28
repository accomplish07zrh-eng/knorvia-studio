// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  traceContextToLogContext,
  type PermissionRuleset,
  type PermissionUpdate,
  type ProjectId,
  type TraceContext,
} from "@knorvia/contracts";
import { applyPermissionUpdates } from "./permission-rules.js";
import type { ToolExecutorDeps } from "./types.js";

type ProjectAccess = { kind: "ready"; projectID: ProjectId } | { kind: "no-project" };
const SKIPPED_MESSAGES = {
  "no-store": "Project permission update skipped without session store",
  "no-project": "Project permission update skipped without persisted session",
} as const;
const MODULE = "core.tool.executor";

async function locateProject(deps: ToolExecutorDeps): Promise<ProjectAccess> {
  const session = await deps.sessionStore?.getSession(deps.sessionId);
  const projectID = session?.projectID;
  return projectID ? { kind: "ready", projectID } : { kind: "no-project" };
}

export async function loadProjectPermissionRuleset(
  deps: ToolExecutorDeps,
): Promise<PermissionRuleset | null> {
  if (!deps.sessionStore) return null;
  const access = await locateProject(deps);
  return access.kind === "ready" ? deps.sessionStore!.getProjectPermission(access.projectID) : null;
}

function reportSkipped(
  reason: keyof typeof SKIPPED_MESSAGES,
  deps: ToolExecutorDeps,
  trace: TraceContext,
) {
  deps.logger?.warn(SKIPPED_MESSAGES[reason], {
    ...traceContextToLogContext(trace),
    event: "tool.permission.project_update.skipped",
    module: MODULE,
    status: "completed",
  });
}

export async function persistProjectPermissionUpdates(
  deps: ToolExecutorDeps,
  updates: PermissionUpdate[],
  traceContext: TraceContext,
): Promise<void> {
  if (!updates.length) return;
  // 缺 store 的诊断原本同步发生；不能引入 await 让调用者变更 logger 后才记录。
  if (!deps.sessionStore) {
    reportSkipped("no-store", deps, traceContext);
    return;
  }
  const access = await locateProject(deps);
  if (access.kind !== "ready") {
    reportSkipped(access.kind, deps, traceContext);
    return;
  }
  const atomicOwner = deps.sessionStore!;
  const atomicUpdate = atomicOwner.updateProjectPermission;
  if (atomicUpdate !== undefined) {
    // 并发授权不能在 core 分别读取后再覆盖；让真实存储 owner 在事务里调用合并。
    // 该能力一旦存在，故障就向上传播，不能退回不具备原子性的旧保存路径。
    await atomicUpdate.call(atomicOwner, {
      projectID: access.projectID,
      update: (current) => applyPermissionUpdates(current ?? { version: 1 }, updates),
    });
  } else {
    // 外部旧 store 保留既有时序；其全量覆盖接口仍没有跨进程并发保证。
    // 能力探测已取得本次读取的 owner；额外读取 getter 会改变旧存储的调用时序。
    const current = await atomicOwner.getProjectPermission(access.projectID);
    const permission = applyPermissionUpdates(current ?? { version: 1 }, updates);
    await deps.sessionStore!.saveProjectPermission({ projectID: access.projectID, permission });
  }
  deps.logger?.info("Project permission updated", {
    ...traceContextToLogContext(traceContext),
    event: "tool.permission.project_update.saved",
    module: MODULE,
    status: "completed",
    updateCount: updates.length,
  });
}
