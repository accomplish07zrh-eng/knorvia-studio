// SPDX-License-Identifier: Apache-2.0
import type { StudioRepository, StoredRun, StoredWorkspace } from "./storePort.js";
import type { StudioConversation } from "../types.js";
import type { StudioGroupDefinition, StudioWorkflowDefinition } from "../workflowTypes.js";
import { STUDIO_WORKFLOW_PERMISSION_KEY } from "../workflowTypes.js";
import { activeRunStates, validStudioId } from "../domain/validation.js";
import { studioProjectKey } from "../domain/projectIdentity.js";
import { WorkspaceRuntimeFault } from "../domain/workspaceRuntime.js";
import { studioKernelConfig } from "./runtimeProjections.js";
import { requiredRun } from "./commandAdmission.js";

export function workspaceRuntimeTarget(db: StudioRepository, runId: string, stepId: string) {
  validStudioId(runId);
  validStudioId(stepId);
  const run = requiredRun(db, runId);
  const saved = db.read<StoredWorkspace>("workspace", `${runId}:${stepId}`);
  if (!saved || saved.remoteKernelId) throw new WorkspaceRuntimeFault("unavailable");
  return {
    run,
    saved,
    key: JSON.stringify([saved.runId, saved.stepId, studioProjectKey(saved.path)]),
  };
}
export function assertWorkspaceRuntimeExecution(
  db: StudioRepository,
  run: StoredRun,
  saved: StoredWorkspace,
  stepId: string,
): void {
  if (activeRunStates.has(run.state)) throw new WorkspaceRuntimeFault("busy");
  for (const other of db.list<StoredRun>("run", { all: true })) {
    if (!activeRunStates.has(other.state)) continue;
    const path =
      other.definition?.workspacePath ??
      db.read<StudioConversation>("conversation", other.targetId)?.workspacePath;
    if (path && studioProjectKey(path) === studioProjectKey(saved.sourcePath))
      throw new WorkspaceRuntimeFault("busy");
  }
  if (db.read("apply-lock", studioProjectKey(saved.sourcePath)))
    throw new WorkspaceRuntimeFault("busy");
  let permission = run.kernelConfig?.permission;
  if (run.kind === "chat") {
    const conversation = db.read<StudioConversation>("conversation", run.targetId);
    if (!conversation) throw new WorkspaceRuntimeFault("unavailable");
    permission ??= studioKernelConfig(db, conversation.kernel).permission;
  } else if (run.kind === "group") {
    const group = run.definition as StudioGroupDefinition | undefined;
    const member = group
      ? [group.host, ...group.members].find((id) => id === saved.stepId)
      : undefined;
    if (!member) throw new WorkspaceRuntimeFault("unavailable");
    permission = studioKernelConfig(db, member).permission;
  } else {
    const workflow = run.definition as StudioWorkflowDefinition | undefined;
    const node = workflow?.nodes.find((item) => stepId.startsWith(`workflow:${item.id}:`));
    if (!node) throw new WorkspaceRuntimeFault("unavailable");
    const values = [
      run.checkpoint.values[STUDIO_WORKFLOW_PERMISSION_KEY],
      node.data.permission,
      studioKernelConfig(db, node.data.kernel).permission,
    ];
    permission = values.includes("read-only") ? "read-only" : "ask";
  }
  if (permission === "read-only") throw new WorkspaceRuntimeFault("read-only");
}
