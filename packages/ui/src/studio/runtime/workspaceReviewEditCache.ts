// SPDX-License-Identifier: Apache-2.0
import { sanitizeHandoffText } from "@knorvia/shared";
import type { StudioCommand, StudioReviewDraft } from "@knorvia/services";

export interface ReviewEdit {
  body: string;
  request?: StudioCommand;
}
export interface ReviewEditCache {
  edits: Record<string, ReviewEdit>;
  revision?: number;
  error?: string;
}
const key = (draft: StudioReviewDraft) => `knorvia-workspace-review-edit:${draft.id}`;
const scope = (draft: StudioReviewDraft) =>
  JSON.stringify([draft.projectKey, draft.targetId, draft.runId, draft.stepId]);
export function readReviewEdits(
  storage: Pick<Storage, "getItem">,
  draft: StudioReviewDraft,
): ReviewEditCache {
  try {
    const raw = storage.getItem(key(draft));
    if (!raw) return { edits: {}, revision: 0 };
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !Number.isSafeInteger(data.revision) ||
      data.revision < 0 ||
      data.scope !== scope(draft) ||
      !data.edits ||
      typeof data.edits !== "object" ||
      Array.isArray(data.edits)
    )
      throw new Error("评审编辑缓存版本或身份不匹配，已保留原数据");
    for (const [id, edit] of Object.entries(data.edits) as [string, ReviewEdit][]) {
      if (
        !/^[\w:-]{1,180}$/.test(id) ||
        !edit ||
        typeof edit.body !== "string" ||
        edit.body.length > 1000 ||
        sanitizeHandoffText(edit.body) !== edit.body
      )
        throw new Error("评审编辑缓存无效，已保留原数据");
      const request = edit.request;
      if (
        request &&
        (request.type !== "workspace-review" ||
          request.action !== "save-comment" ||
          request.runId !== draft.runId ||
          request.stepId !== draft.stepId ||
          request.draftId !== draft.id ||
          request.commentId !== id ||
          sanitizeHandoffText(request.body) !== request.body)
      )
        throw new Error("评审待确认请求身份不匹配，已保留原数据");
    }
    return { edits: data.edits, revision: data.revision };
  } catch (error) {
    return { edits: {}, error: error instanceof Error ? error.message : String(error) };
  }
}
export function writeReviewEdits(
  storage: Pick<Storage, "getItem" | "setItem">,
  draft: StudioReviewDraft,
  edits: Record<string, ReviewEdit>,
  expectedRevision?: number,
): string | undefined {
  const read = readReviewEdits(storage, draft);
  if (read.error) return read.error;
  if (expectedRevision !== undefined && read.revision !== expectedRevision)
    return "其他窗口的本机草稿已变化，保留已有缓存；请明确保存当前文字到 Host";
  try {
    storage.setItem(
      key(draft),
      JSON.stringify({
        version: 1,
        revision: (read.revision ?? 0) + 1,
        scope: scope(draft),
        edits,
      }),
    );
  } catch {
    return "无法保存本机编辑草稿；请保存到 Host 后再关闭";
  }
}
