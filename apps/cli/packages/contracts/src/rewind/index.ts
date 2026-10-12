// SPDX-License-Identifier: Apache-2.0
// rewind 子路径的公开入口：只做再导出与 payload 解析，不承载实现。
// 兼容面（导出名与签名）冻结在 contracts-02 的 interface.md；实现落在
// payload-schemas.ts（声明与 schema）、target-evaluation.ts（判定规则表）、
// active-branch.ts（分支裁剪）。
export {
  RewindScope,
  RewindStrategy,
  RewindTargetStatus,
  checkpointCreatedPayloadSchema,
  rewindTriggeredPayloadSchema,
  workspaceCheckpointArtifactSchema,
} from "./payload-schemas.js";
export type {
  ActiveConversationBranchOptions,
  CheckpointCreatedPayload,
  CheckpointProjectionInfo,
  EvaluateRewindTargetInput,
  RewindProjectionInfo,
  RewindTargetEvaluation,
  RewindTriggeredPayload,
  WorkspaceCheckpointArtifact,
} from "./payload-schemas.js";
export { evaluateRewindTarget } from "./target-evaluation.js";
export { selectActiveConversationBranch } from "./active-branch.js";

import {
  checkpointCreatedPayloadSchema,
  rewindTriggeredPayloadSchema,
  workspaceCheckpointArtifactSchema,
  type CheckpointCreatedPayload,
  type RewindTriggeredPayload,
  type WorkspaceCheckpointArtifact,
} from "./payload-schemas.js";

export function parseCheckpointCreatedPayload(input: unknown): CheckpointCreatedPayload {
  return checkpointCreatedPayloadSchema.parse(input) as CheckpointCreatedPayload;
}

export function parseRewindTriggeredPayload(input: unknown): RewindTriggeredPayload {
  return rewindTriggeredPayloadSchema.parse(input) as RewindTriggeredPayload;
}

export function parseWorkspaceCheckpointArtifact(input: unknown): WorkspaceCheckpointArtifact {
  return workspaceCheckpointArtifactSchema.parse(input) as WorkspaceCheckpointArtifact;
}
