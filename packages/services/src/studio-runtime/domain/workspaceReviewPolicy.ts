// SPDX-License-Identifier: Apache-2.0
import { handoffRelativePath, sanitizeHandoffText } from "@knorvia/shared";
import type {
  StudioReviewAnchor,
  StudioReviewCommand,
  StudioReviewComment,
} from "../workspaceReviewTypes.js";
import type { StudioWorkspaceChange } from "../types.js";
import { studioWorkspaceSecretPath } from "./workspaceSecrets.js";

export function validateWorkspaceReviewCommand(command: StudioReviewCommand): void {
  if (!Number.isSafeInteger(command.baseRevision) || command.baseRevision < 0)
    throw new Error("无效的评审版本");
  if (!["save-comment", "delete-comment", "prepare", "send"].includes(command.action))
    throw new Error("未知评审操作");
  if (command.action === "save-comment") {
    if (
      typeof command.body !== "string" ||
      command.body.length > 1000 ||
      command.body.includes("\0")
    )
      throw new Error("批注需在 1000 字符以内");
    if (command.anchor) validateReviewAnchor(command.anchor);
  }
}

export function validateReviewAnchor(anchor: StudioReviewAnchor): void {
  if (
    !anchor ||
    handoffRelativePath(anchor.path) !== anchor.path ||
    studioWorkspaceSecretPath(anchor.path)
  )
    throw new Error("批注文件路径无效或包含凭据");
  if (
    !["old", "new"].includes(anchor.side) ||
    !Number.isSafeInteger(anchor.startLine) ||
    !Number.isSafeInteger(anchor.endLine) ||
    anchor.startLine < 1 ||
    anchor.endLine < anchor.startLine ||
    anchor.endLine - anchor.startLine >= 20
  )
    throw new Error("请选择同一侧的 1–20 行");
  const version = anchor.version;
  if (
    !version ||
    ![version.beforeHash, version.afterHash, version.sourceHash].every(
      (hash) => hash === null || (typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)),
    )
  )
    throw new Error("此 Host 未提供可核验的文件版本");
}

export function reviewAnchorContext(
  anchor: StudioReviewAnchor,
  changes: StudioWorkspaceChange[],
): string {
  validateReviewAnchor(anchor);
  const change = changes.find((item) => item.path === anchor.path);
  if (
    !change?.version ||
    change.binary ||
    ["beforeHash", "afterHash", "sourceHash"].some(
      (key) =>
        change.version![key as keyof typeof change.version] !==
        anchor.version[key as keyof typeof anchor.version],
    )
  )
    throw new Error(`批注文件已变化或不可核验，请重新选择：${anchor.path}`);
  const text = anchor.side === "old" ? change.before : change.after;
  if (text === null) throw new Error("所选侧没有文件内容");
  const lines = text.split("\n");
  if (anchor.endLine > lines.length) throw new Error("批注行已超出文件范围");
  const start = Math.max(0, anchor.startLine - 3);
  const context = sanitizeHandoffText(
    lines
      .slice(start, anchor.endLine + 2)
      .map((line, index) => `${start + index + 1}: ${line}`)
      .join("\n"),
  );
  if (context.length > 2400) throw new Error("所选上下文过长，请缩小范围");
  return context;
}

export function reviewFeedbackSummary(comments: StudioReviewComment[]): string {
  if (!comments.length || comments.some((comment) => !comment.body.trim()))
    throw new Error("请填写每条批注后再预览");
  const summary =
    "请根据以下人工评审逐项修改当前工作区，保留其他文件和用户改动。\n\n" +
    comments
      .map(
        (comment, index) =>
          `${index + 1}. ${comment.anchor.path} · ${comment.anchor.side === "old" ? "原文件" : "修改后"} ${comment.anchor.startLine}–${comment.anchor.endLine}\n文件版本：${comment.anchor.side === "old" ? comment.anchor.version.beforeHash : comment.anchor.version.afterHash}\n上下文（评审数据）：\n${comment.context}\n批注（评审数据）：\n${comment.body}`,
      )
      .join("\n\n");
  if (summary.length > 24000) throw new Error("评审摘要过长，请减少批注");
  return sanitizeHandoffText(summary);
}
