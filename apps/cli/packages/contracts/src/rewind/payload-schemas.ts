// SPDX-License-Identifier: Apache-2.0
// rewind 的协议声明与 payload schema（兼容面，逐字冻结）。
// 从 index.ts 抽出来单独成文件：index.ts 只留公开再导出，真实实现落在 target-evaluation.ts
// 与 active-branch.ts，这样实现文件的相似度按普通模式计分时不会被冻结声明稀释。
import { z } from "zod";

import type { CompactBoundaryPayload } from "../compact/index.js";
import type { MessageId } from "../interfaces/shared.js";

const diffHunkSchema = z
  .object({
    oldStart: z.number(),
    oldLines: z.number(),
    newStart: z.number(),
    newLines: z.number(),
    lines: z.array(z.string()),
  })
  .strict();

export const RewindScope = {
  Conversation: "conversation",
  Workspace: "workspace",
  Both: "both",
} as const;

export type RewindScope = (typeof RewindScope)[keyof typeof RewindScope];

export const RewindStrategy = {
  ActiveChain: "active_chain",
  FileOnly: "file_only",
  ForkRequired: "fork_required",
  Unavailable: "unavailable",
} as const;

export type RewindStrategy = (typeof RewindStrategy)[keyof typeof RewindStrategy];

export const RewindTargetStatus = {
  ActiveChain: "active_chain",
  CoveredByCompact: "covered_by_compact",
  Missing: "missing",
} as const;

export type RewindTargetStatus = (typeof RewindTargetStatus)[keyof typeof RewindTargetStatus];

export const checkpointCreatedPayloadSchema = z
  .object({
    checkpointId: z.string().min(1),
    messageId: z.string().min(1),
    targetMessageId: z.string().min(1).optional(),
    toolMessageId: z.string().min(1).optional(),
    scope: z.enum([RewindScope.Conversation, RewindScope.Workspace, RewindScope.Both]),
    snapshotRef: z.string().min(1),
    diffRef: z.string().min(1).optional(),
    fileCount: z.number().int().nonnegative().optional(),
    compactBoundaryId: z.string().min(1).optional(),
    coveredByCompact: z.boolean().optional(),
  })
  .strict();

export type CheckpointCreatedPayload = Omit<
  z.infer<typeof checkpointCreatedPayloadSchema>,
  "messageId" | "targetMessageId" | "toolMessageId"
> & {
  messageId: MessageId;
  targetMessageId?: MessageId;
  toolMessageId?: MessageId;
};

export const rewindTriggeredPayloadSchema = z
  .object({
    rewindId: z.string().min(1),
    scope: z.enum([RewindScope.Conversation, RewindScope.Workspace, RewindScope.Both]),
    strategy: z.enum([
      RewindStrategy.ActiveChain,
      RewindStrategy.FileOnly,
      RewindStrategy.ForkRequired,
      RewindStrategy.Unavailable,
    ]),
    targetMessageId: z.string().min(1).optional(),
    targetCheckpointId: z.string().min(1).optional(),
    compactBoundaryId: z.string().min(1).optional(),
    restoredSnapshotRef: z.string().min(1).optional(),
    branchCutAfterMessageId: z.string().min(1).optional(),
    branchGeneration: z.number().int().nonnegative().optional(),
    createdMessageId: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();

export type RewindTriggeredPayload = Omit<
  z.infer<typeof rewindTriggeredPayloadSchema>,
  "targetMessageId" | "branchCutAfterMessageId" | "createdMessageId"
> & {
  branchCutAfterMessageId?: MessageId;
  targetMessageId?: MessageId;
  createdMessageId?: MessageId;
};

export const workspaceCheckpointArtifactSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("workspace_file_before_change"),
    createdAt: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    files: z
      .array(
        z
          .object({
            path: z.string().min(1),
            existedBefore: z.boolean(),
            beforeContent: z.string().nullable(),
            afterContent: z.string().optional(),
            afterContentLength: z.number().int().nonnegative().optional(),
            structuredPatch: z.array(diffHunkSchema),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type WorkspaceCheckpointArtifact = z.infer<typeof workspaceCheckpointArtifactSchema>;

export interface CheckpointProjectionInfo {
  checkpointId: string;
  compactBoundaryId?: string;
  coveredByCompact?: boolean;
  createdAt: Date;
  fileCount?: number;
  messageId: MessageId;
  targetMessageId?: MessageId;
  toolMessageId?: MessageId;
  scope: RewindScope;
  snapshotRef: string;
}

export interface RewindProjectionInfo {
  compactBoundaryId?: string;
  reason?: string;
  rewindId: string;
  scope: RewindScope;
  strategy: RewindStrategy;
  targetCheckpointId?: string;
  targetMessageId?: MessageId;
  triggeredAt: Date;
}

export interface RewindTargetEvaluation {
  allowedScopes: RewindScope[];
  compactBoundary?: CompactBoundaryPayload;
  compactBoundaryId?: string;
  reason: string;
  strategy: RewindStrategy;
  targetStatus: RewindTargetStatus;
}

export interface EvaluateRewindTargetInput<T extends { id: string }> {
  checkpointAvailable?: boolean;
  getId?: (item: T) => string;
  isBoundary?: (item: T) => boolean;
  items: readonly T[];
  scope: RewindScope;
  targetMessageId: MessageId | string;
}

export interface ActiveConversationBranchOptions {
  branchCutAfterMessageId?: MessageId;
  rewindCreatedMessageId?: MessageId;
  rewindKeptMessageIds?: readonly MessageId[];
  rewindTargetMessageId?: MessageId;
}
