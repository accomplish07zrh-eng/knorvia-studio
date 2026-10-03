import type { KnorviaMessageWithParts } from "./protocol-legacy-types.js";

import { textFromKnorviaMessageParts } from "./protocol-legacy-types.js";

import type { KnorviaStreamEvent } from "./task-types-core.js";

export interface KnorviaBackgroundTaskNotificationInfo {
  error?: string;
  outputFile?: string;
  result?: string;
  status?: string;
  summary?: string;
  taskId?: string;
}

function notificationField(text: string, tag: string): string | undefined {
  const capture = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "u").exec(text);
  const body = capture?.[1]?.trim();
  if (!body) {
    return undefined;
  }
  return body
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

export function parseKnorviaBackgroundTaskNotificationText(text: string | undefined): {
  notification: KnorviaBackgroundTaskNotificationInfo;
  toolUseId: string;
} | null {
  const content = text?.trim();
  if (!content?.startsWith("<task-notification>")) {
    return null;
  }

  const toolUseId = notificationField(content, "tool-use-id");
  if (!toolUseId) {
    return null;
  }

  return {
    notification: {
      error: notificationField(content, "error"),
      outputFile: notificationField(content, "output-file"),
      result: notificationField(content, "result"),
      status: notificationField(content, "status"),
      summary: notificationField(content, "summary"),
      taskId: notificationField(content, "task-id"),
    },
    toolUseId,
  };
}

export function collectKnorviaBackgroundTaskNotificationsByToolUseId(
  messages: readonly KnorviaMessageWithParts[],
): Map<string, KnorviaBackgroundTaskNotificationInfo> {
  const notifications = new Map<string, KnorviaBackgroundTaskNotificationInfo>();
  for (const message of messages) {
    if (message.info.role !== "user") {
      continue;
    }
    const parsed = parseKnorviaBackgroundTaskNotificationText(
      textFromKnorviaMessageParts(message.parts),
    );
    if (parsed) {
      notifications.set(parsed.toolUseId, parsed.notification);
    }
  }
  return notifications;
}

export function knorviaBackgroundTaskNotificationToolUpdateStatus(
  status: string | undefined,
): Extract<
  Extract<KnorviaStreamEvent, { type: "tool_call_update" }>["status"],
  "completed" | "failed" | "stopped"
> {
  switch (status) {
    case "failed":
    case "lost":
      return "failed";
    case "stopped":
    case "killed":
      // killed 和 stopped 表示任务被中止，不能将它们映射为已完成。
      return "stopped";
    default:
      return "completed";
  }
}

function notificationRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function attachKnorviaBackgroundTaskNotificationToRaw(
  raw: unknown,
  notification: KnorviaBackgroundTaskNotificationInfo | undefined,
): unknown {
  if (!notification) {
    return raw;
  }

  const record = notificationRecord(raw);
  const metadata = notificationRecord(record._meta);
  const knorvia = notificationRecord(metadata.knorvia);
  return {
    ...record,
    _meta: {
      ...metadata,
      knorvia: {
        ...knorvia,
        taskNotification: notification,
      },
    },
  };
}
