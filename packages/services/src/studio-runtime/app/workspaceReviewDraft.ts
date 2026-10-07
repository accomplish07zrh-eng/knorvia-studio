// SPDX-License-Identifier: Apache-2.0
import { sanitizeHandoffText } from "@knorvia/shared";
import type { StudioCommand, StudioCommandResult } from "../contract.js";
import type { StudioReviewDraft } from "../workspaceReviewTypes.js";
import type { StudioMessage } from "../types.js";
import type { StudioKernelRegistry, StudioWorkspacePort } from "./ports.js";
import type { StudioClock, StudioRepository, StoredRun } from "./storePort.js";
import { validateStudioCommand } from "../domain/validation.js";
import { studioProjectKey } from "../domain/projectIdentity.js";
import { reviewAnchorContext, reviewFeedbackSummary } from "../domain/workspaceReviewPolicy.js";
import { requiredRun } from "./commandAdmission.js";
import { admitStudioCommandReceipt } from "./commandReceipts.js";
import { hasUnknownStudioRun } from "./runQueries.js";
import { inspectStudioWorkspaceChanges, reviewableWorkspace } from "./workspaceReview.js";
import {
  assertWorkspaceReviewBinding,
  workspaceReviewBinding,
  type WorkspaceReviewBinding,
} from "./workspaceReviewTarget.js";
import { projectWorkspaceReview } from "./workspaceReviewProjection.js";

export interface StoredReviewDraft extends StudioReviewDraft {
  schema: 1;
  binding: WorkspaceReviewBinding;
}
export interface WorkspaceFeedback {
  originalRunId: string;
  originalStepId: string;
  binding: WorkspaceReviewBinding;
  comments: StudioReviewDraft["comments"];
}
interface Dependencies {
  db: StudioRepository;
  clock: StudioClock;
  kernels: StudioKernelRegistry;
  workspaces: StudioWorkspacePort;
  process?: { id: number; alive(id: number): boolean };
}
type Command = Extract<StudioCommand, { type: "workspace-review" }>;
const keyOf = (runId: string, stepId: string) => JSON.stringify([runId, stepId]);

/** Review mutations have one durable owner; accepted feedback uses existing receipts and runs. */
export async function admitWorkspaceReview(
  deps: Dependencies,
  input: Command,
): Promise<StudioCommandResult> {
  const { db, clock } = deps;
  validateStudioCommand(input);
  const common = {
    type: "workspace-review" as const,
    commandId: input.commandId,
    runId: input.runId,
    stepId: input.stepId,
    draftId: input.draftId,
    baseRevision: input.baseRevision,
  };
  const command: Command =
    input.action === "save-comment"
      ? {
          ...common,
          action: input.action,
          commentId: input.commentId,
          body: sanitizeHandoffText(input.body),
          ...(input.anchor
            ? {
                anchor: {
                  path: input.anchor.path,
                  side: input.anchor.side,
                  startLine: input.anchor.startLine,
                  endLine: input.anchor.endLine,
                  version: {
                    beforeHash: input.anchor.version.beforeHash,
                    afterHash: input.anchor.version.afterHash,
                    sourceHash: input.anchor.version.sourceHash,
                  },
                },
              }
            : {}),
        }
      : input.action === "delete-comment"
        ? { ...common, action: input.action, commentId: input.commentId }
        : input.action === "send"
          ? { ...common, action: input.action, previewId: input.previewId }
          : { ...common, action: "prepare" };
  const key = keyOf(command.runId, command.stepId);
  // 已受理的反馈可能已经改动文件；重试先读原回执，不能再次校验后生成第二次发送。
  if (db.read("command", command.commandId)) {
    const result = db.transaction(() =>
      admitStudioCommandReceipt(db, clock, command, () => {
        throw new Error("回执丢失");
      }),
    );
    const draft = db.read<StoredReviewDraft>("workspace-review-draft", key);
    return {
      ...result,
      ...(draft?.schema === 1 ? { reviewDraft: projectWorkspaceReview(db, draft) } : {}),
    };
  }
  const old = db.read<StoredReviewDraft>("workspace-review-draft", key);
  if (old && old.schema !== 1) throw new Error("未知评审草稿格式，已保留原数据");
  assertRevision(old, command);
  const workspace = reviewableWorkspace(deps, command.runId, command.stepId);
  const binding =
    old?.binding ?? workspaceReviewBinding(db, command.runId, command.stepId, workspace);
  const needsBinding =
    !old ||
    command.action === "prepare" ||
    command.action === "send" ||
    (command.action === "save-comment" && Boolean(command.anchor));
  if (needsBinding) assertWorkspaceReviewBinding(db, command.runId, command.stepId, binding);
  let context: string | undefined;
  if (command.action === "save-comment" && command.anchor) {
    context = reviewAnchorContext(
      command.anchor,
      await inspectStudioWorkspaceChanges(deps, command.runId, command.stepId),
    );
  }
  if (command.action === "prepare" || command.action === "send") {
    if (!old) throw new Error("请先保存批注");
    const changes = await inspectStudioWorkspaceChanges(deps, command.runId, command.stepId);
    for (const comment of old.comments) {
      if (reviewAnchorContext(comment.anchor, changes) !== comment.context)
        throw new Error("批注上下文已变化，请重新选择");
    }
    if (
      command.action === "send" &&
      (!old.preview ||
        old.preview.id !== command.previewId ||
        old.preview.commandId !== command.commandId)
    )
      throw new Error("请使用已确认摘要的发送请求");
  }
  return db.transaction(() => {
    // 相同请求的并发读取也可跨 await 完成；事务内先复用已受理的回执，再检查草稿版本。
    if (db.read("command", command.commandId)) {
      const result = admitStudioCommandReceipt(db, clock, command, () => {
        throw new Error("回执丢失");
      });
      const saved = db.read<StoredReviewDraft>("workspace-review-draft", key);
      return {
        ...result,
        ...(saved?.schema === 1 ? { reviewDraft: projectWorkspaceReview(db, saved) } : {}),
      };
    }
    const current = db.read<StoredReviewDraft>("workspace-review-draft", key);
    assertRevision(current, command);
    reviewableWorkspace(deps, command.runId, command.stepId);
    if (needsBinding) assertWorkspaceReviewBinding(db, command.runId, command.stepId, binding);
    let draft: StoredReviewDraft = current ?? {
      schema: 1,
      id: clock.id(),
      projectKey: studioProjectKey(workspace.sourcePath),
      targetId: requiredRun(db, command.runId).targetId,
      runId: command.runId,
      stepId: command.stepId,
      kernel: binding.kernel,
      revision: 0,
      comments: [],
      binding,
    };
    const result = admitStudioCommandReceipt(db, clock, command, () => {
      if (command.action === "save-comment") {
        const existing = draft.comments.find((comment) => comment.id === command.commentId);
        if (!existing && (!command.anchor || context === undefined))
          throw new Error("新批注需要文件锚点");
        if (!existing && draft.comments.length >= 20) throw new Error("每个步骤最多保存 20 条批注");
        const comment = {
          id: command.commentId,
          body: command.body,
          anchor: command.anchor ?? existing!.anchor,
          context: context ?? existing!.context,
        };
        draft = {
          ...draft,
          comments: [...draft.comments.filter((item) => item.id !== comment.id), comment],
          preview: undefined,
        };
      } else if (command.action === "delete-comment") {
        draft = {
          ...draft,
          comments: draft.comments.filter((item) => item.id !== command.commentId),
          preview: undefined,
        };
      } else if (command.action === "prepare") {
        draft = {
          ...draft,
          preview: {
            id: clock.id(),
            commandId: clock.id(),
            summary: reviewFeedbackSummary(draft.comments),
          },
        };
      } else {
        if (!draft.preview) throw new Error("请先预览并确认摘要");
        if (hasUnknownStudioRun(db, draft.targetId))
          throw new Error("原任务有结果未知的运行，请先检查后再回传");
        const original = requiredRun(db, command.runId);
        const id = clock.id();
        const now = clock.now();
        const run: StoredRun = {
          id,
          kind: original.kind,
          targetId: original.targetId,
          input: draft.preview.summary,
          state: "queued",
          attempt: 1,
          createdAt: now,
          updatedAt: now,
          checkpoint: { steps: {}, values: {}, completedRounds: 0 },
          definition: original.definition,
          kernelConfig: original.kernelConfig,
          workspaceGeneration: original.workspaceGeneration,
          workspaceFeedback: {
            originalRunId: command.runId,
            originalStepId: command.stepId,
            binding,
            comments: draft.comments,
          },
        };
        db.write("run", id, run, run.targetId);
        db.write("active", id, { id, targetId: run.targetId });
        const messageId = clock.id();
        db.write<StudioMessage>(
          "message",
          messageId,
          {
            id: messageId,
            targetId: run.targetId,
            runId: id,
            sender: "user",
            kind: "text",
            text: run.input,
            createdAt: now,
            updatedAt: now,
          },
          run.targetId,
        );
        draft = { ...draft, lastDelivery: { runId: id }, preview: undefined };
        draft = { ...draft, revision: draft.revision + 1 };
        db.write("workspace-review-draft", key, draft, draft.targetId);
        return id;
      }
      draft = { ...draft, revision: draft.revision + 1 };
      db.write("workspace-review-draft", key, draft, draft.targetId);
      return draft.id;
    });
    return { ...result, reviewDraft: projectWorkspaceReview(db, draft) };
  });
}

function assertRevision(draft: StoredReviewDraft | undefined, command: Command): void {
  if (
    (draft?.revision ?? 0) !== command.baseRevision ||
    (command.draftId && draft?.id !== command.draftId)
  )
    throw new Error("评审版本已在其他窗口修改，请重新读取；当前批注仍保留");
}

/** Final dispatch validation belongs to the existing run owner, after its session lock. */
export async function verifyWorkspaceFeedback(
  deps: Pick<Dependencies, "db" | "workspaces">,
  feedback: WorkspaceFeedback,
): Promise<void> {
  assertWorkspaceReviewBinding(
    deps.db,
    feedback.originalRunId,
    feedback.originalStepId,
    feedback.binding,
  );
  const lock = deps.db.read("apply-lock", studioProjectKey(feedback.binding.workspace.sourcePath));
  if (lock) throw new Error("项目正在应用修改或需要恢复，请检查后重试");
  const changes = await deps.workspaces.changes(
    feedback.binding.workspace.runId,
    feedback.binding.workspace.stepId,
  );
  for (const comment of feedback.comments) reviewAnchorContext(comment.anchor, changes);
  assertWorkspaceReviewBinding(
    deps.db,
    feedback.originalRunId,
    feedback.originalStepId,
    feedback.binding,
  );
}
