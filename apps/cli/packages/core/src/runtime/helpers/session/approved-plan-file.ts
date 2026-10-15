// SPDX-License-Identifier: Apache-2.0
// 计划文件的写入与回读（B22）。
// 批准的计划落到工作区磁盘 `<workspaceRoot>/.knorvia-studio/plans/plan-<清洗后的会话 id>.md`：
// 写入是原子写并创建父目录（同会话重复写覆盖同一路径）；回读产出一条来源为
// plan_file_reference 的系统提醒分片（正文含路径与计划全文），文件不存在或内容为空返回
// undefined。计划正文为空 → InvalidInput（可恢复）；会话 id 清洗后为空 → InvalidInput
// （不可恢复）；回读遇 not_found 返回 undefined，其余文件系统错误原样冒泡。
import { join } from "node:path";
import {
  CoreErrorType,
  PLAN_MODE_MAX_PLAN_CHARS,
  createCoreError,
  isFileSystemPortError,
  type FileSystemPort,
  type SessionId,
  type TraceContext,
} from "@knorvia/contracts";
import {
  systemReminderAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";

// 计划文件位置：`.knorvia-studio/plans/plan-<清洗 id>.md`（路径片段逐字冻结）。
const PLAN_DIR_SEGMENTS = [".knorvia-studio", "plans"] as const;

// 回读的字节上限：计划字符上限 ×4 + 1024（行为契约）。
const READ_LIMIT_BYTES = PLAN_MODE_MAX_PLAN_CHARS * 4 + 1024;

// 两个错误文案（逐字冻结）：空计划可恢复，洗不出文件名不可恢复。
const EMPTY_PLAN_MESSAGE = "ExitPlanMode plan cannot be empty";
const PLAN_NAME_MESSAGE = "Session id cannot produce a plan file name";

// 回读分片的来源与正文骨架（逐字契约）。
const PLAN_REFERENCE_SOURCE = "plan_file_reference";

export interface ApprovedPlanFileRequest {
  abortSignal?: AbortSignal;
  fileSystemPort: FileSystemPort;
  sessionId: SessionId | string;
  traceContext?: TraceContext;
  workspaceRoot: string;
}

// 会话 id 清洗：非 [A-Za-z0-9._-] 的字符成段换 `-`，再去首尾连字符。
function sanitizeSessionSegment(raw: string): string {
  const trimmed = raw.trim();
  const dashed = trimmed.replace(/[^A-Za-z0-9._-]+/g, "-"); // 无效字符成段换连字符
  return dashed.replace(/^-+|-+$/g, ""); // 首尾连字符去掉
}

function planFilePath(request: ApprovedPlanFileRequest): string {
  const segment = sanitizeSessionSegment(String(request.sessionId));
  if (!segment) {
    throw createCoreError(CoreErrorType.InvalidInput, PLAN_NAME_MESSAGE, { recoverable: false });
  }
  const fileName = `plan-${segment}.md`;
  return join(request.workspaceRoot, ...PLAN_DIR_SEGMENTS, fileName);
}

export const writeApprovedPlanFile = async (
  request: ApprovedPlanFileRequest & { plan: string },
): Promise<{ path: string }> => {
  if (!request.plan.trim()) {
    throw createCoreError(CoreErrorType.InvalidInput, EMPTY_PLAN_MESSAGE, { recoverable: true });
  }

  const target = planFilePath(request);
  const writeRequest = {
    atomic: true, // 原子写：同路径覆盖不留半截文件
    content: request.plan,
    createParents: true, // plans 目录按需创建
    encoding: "utf8" as const,
    path: target,
    trace: request.traceContext,
  };
  await request.fileSystemPort.writeTextFile(writeRequest, { signal: request.abortSignal });
  return { path: target };
};

export const readApprovedPlanFileReferenceEntry = async (
  request: ApprovedPlanFileRequest,
): Promise<RuntimeMessageEntry | undefined> => {
  const target = planFilePath(request);
  // 回读带上限；not_found 归一成 undefined，其余错误原样冒泡。
  const content = await request.fileSystemPort
    .readTextFile(
      {
        maxBytes: READ_LIMIT_BYTES,
        path: target,
        trace: request.traceContext,
      },
      { signal: request.abortSignal },
    )
    .then((outcome) => outcome.content)
    .catch((error: unknown) => {
      if (isFileSystemPortError(error) && error.code === "not_found") return undefined;
      return Promise.reject(error); // 非 not_found 的文件系统错误必须冒泡
    });

  if (content === undefined || !content.trim()) return undefined;

  const body = [
    `A plan file exists from plan mode at: ${target}`,
    "",
    `Plan contents:\n\n${content}\n\nIf this plan is relevant to the current work and not already complete, continue working on it.`,
  ].join("\n");
  return systemReminderAttachmentEntry(PLAN_REFERENCE_SOURCE, body);
};
