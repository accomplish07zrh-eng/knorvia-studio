// SPDX-License-Identifier: Apache-2.0
import type { StudioKernelConfig, StudioKernelId, StudioPermission } from "../kernelTypes.js";
import type { StudioTurnSnapshot } from "../types.js";
import type { StoredSession, StoredWorkspace, StudioRepository } from "./storePort.js";
import { requiredRun } from "./commandAdmission.js";
import { studioProjectKey } from "../domain/projectIdentity.js";
import { stricterStudioPermission } from "../domain/workflowGraph.js";
import { studioKernelConfig } from "./runtimeProjections.js";

export interface WorkspaceReviewBinding {
  turnId: string;
  kernel: StudioKernelId;
  memberId?: StudioKernelId;
  conversationId: string;
  nativeSessionId: string;
  sessionKey: string;
  workspace: StoredWorkspace;
  config: StudioKernelConfig;
  permission: StudioPermission;
}
export function workspaceReviewBinding(
  db: StudioRepository,
  runId: string,
  stepId: string,
  workspace: StoredWorkspace,
): WorkspaceReviewBinding {
  const run = requiredRun(db, runId);
  const turn = db
    .list<StudioTurnSnapshot>("turn", { scope: runId, limit: 1000 })
    .find(
      (item) =>
        item.stepId === stepId &&
        item.attempt === run.attempt &&
        item.kernel &&
        item.conversationId &&
        item.workspacePath,
    );
  if (!turn?.kernel || !turn.conversationId || !turn.workspacePath)
    throw new Error("此历史步骤缺少原会话身份，不能定向回传");
  // 远端旧协议没有原生会话与文件版本证据；保持原来的查看/应用，不猜测新的会话。
  if (workspace.remoteKernelId) throw new Error("当前远端协议不支持可核验的定向评审回传");
  const current = db.read<{
    workspacePath?: string;
    kernel?: StudioKernelId;
    members?: StudioKernelId[];
    nodes?: { id: string; data: { kernel?: StudioKernelId } }[];
  }>(run.kind === "chat" ? "conversation" : run.kind, run.targetId);
  if (
    !current?.workspacePath ||
    studioProjectKey(current.workspacePath) !== studioProjectKey(workspace.sourcePath) ||
    (run.kind === "chat" && current.kernel !== turn.kernel) ||
    (run.kind === "group" && !current.members?.includes(turn.memberId ?? turn.kernel))
  )
    throw new Error("原任务项目或成员已变化，请返回原任务检查");
  if (run.kind === "workflow") {
    const nodeId = /^workflow:(.*):attempt:\d+$/.exec(stepId)?.[1];
    if (
      !nodeId ||
      !current.nodes?.some((node) => node.id === nodeId && node.data.kernel === turn.kernel)
    )
      throw new Error("原工作流节点或内核已变化");
  }
  const sessionKey = `${turn.conversationId}:${turn.workspacePath}`;
  const session = db.read<StoredSession>("session", sessionKey);
  // 旧索引行存在不代表有原生身份；空 ID 会令 adapter 新建会话，必须在回传前拒绝。
  if (
    !session ||
    typeof session.nativeSessionId !== "string" ||
    !session.nativeSessionId.trim() ||
    session.workspacePath !== workspace.path ||
    (turn.nativeSessionId && session.nativeSessionId !== turn.nativeSessionId)
  )
    throw new Error("原会话已变化或不可用，不能创建新会话代替回传");
  const config = run.kernelConfig ?? studioKernelConfig(db, turn.kernel);
  return {
    turnId: turn.id,
    kernel: turn.kernel,
    memberId: turn.memberId,
    conversationId: turn.conversationId,
    nativeSessionId: session.nativeSessionId,
    sessionKey,
    workspace,
    config,
    permission: stricterStudioPermission(
      turn.permission ?? "ask",
      studioKernelConfig(db, turn.kernel).permission,
    ),
  };
}
export function assertWorkspaceReviewBinding(
  db: StudioRepository,
  runId: string,
  stepId: string,
  binding: WorkspaceReviewBinding,
): void {
  const workspace = db.read<StoredWorkspace>("workspace", `${runId}:${stepId}`);
  if (!workspace || JSON.stringify(workspace) !== JSON.stringify(binding.workspace))
    throw new Error("原工作区身份已变化");
  const current = workspaceReviewBinding(db, runId, stepId, workspace);
  if (
    current.turnId !== binding.turnId ||
    current.nativeSessionId !== binding.nativeSessionId ||
    current.sessionKey !== binding.sessionKey ||
    current.permission !== binding.permission
  )
    throw new Error("原会话已变化，请重新检查评审");
}
