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
} from "../../agent/message-history.js";

function planFilePath(input: { sessionId: SessionId | string; workspaceRoot: string }): string {
  const workspaceRoot = input.workspaceRoot;
  const sanitizedSession = String(input.sessionId)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitizedSession) {
    throw createCoreError(
      CoreErrorType.InvalidInput,
      "Session id cannot produce a plan file name",
      { recoverable: false },
    );
  }

  return join(workspaceRoot, ".knorvia-studio", "plans", `plan-${sanitizedSession}.md`);
}

export async function writeApprovedPlanFile(input: {
  abortSignal?: AbortSignal;
  fileSystemPort: FileSystemPort;
  plan: string;
  sessionId: SessionId | string;
  traceContext?: TraceContext;
  workspaceRoot: string;
}): Promise<{ path: string }> {
  if (!input.plan.trim()) {
    throw createCoreError(CoreErrorType.InvalidInput, "ExitPlanMode plan cannot be empty", {
      recoverable: true,
    });
  }

  const path = planFilePath(input);
  await input.fileSystemPort.writeTextFile(
    {
      atomic: true,
      content: input.plan,
      createParents: true,
      encoding: "utf8",
      path,
      trace: input.traceContext,
    },
    { signal: input.abortSignal },
  );
  return { path };
}

export async function readApprovedPlanFileReferenceEntry(input: {
  abortSignal?: AbortSignal;
  fileSystemPort: FileSystemPort;
  sessionId: SessionId | string;
  traceContext?: TraceContext;
  workspaceRoot: string;
}): Promise<RuntimeMessageEntry | undefined> {
  const path = planFilePath(input);
  let content: string;
  try {
    const read = await input.fileSystemPort.readTextFile(
      {
        maxBytes: PLAN_MODE_MAX_PLAN_CHARS * 4 + 1024,
        path,
        trace: input.traceContext,
      },
      { signal: input.abortSignal },
    );
    content = read.content;
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === "not_found") {
      return undefined;
    }
    throw error;
  }

  if (!content.trim()) {
    return undefined;
  }

  return systemReminderAttachmentEntry(
    "plan_file_reference",
    [
      `A plan file exists from plan mode at: ${path}`,
      "",
      "Plan contents:",
      "",
      content,
      "",
      "If this plan is relevant to the current work and not already complete, continue working on it.",
    ].join("\n"),
  );
}
