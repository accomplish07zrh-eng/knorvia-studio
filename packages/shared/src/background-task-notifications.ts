// SPDX-License-Identifier: Apache-2.0

import type { KnorviaMessageWithParts } from "./protocol-legacy-types.js";
import { textFromKnorviaMessageParts } from "./protocol-legacy-types.js";

type ToolUpdateStatus = "completed" | "failed" | "stopped";

const NOTIFICATION_TAGS = [
  ["error", "error"],
  ["outputFile", "output-file"],
  ["result", "result"],
  ["status", "status"],
  ["summary", "summary"],
  ["taskId", "task-id"],
] as const;

export type KnorviaBackgroundTaskNotificationInfo = {
  [Entry in (typeof NOTIFICATION_TAGS)[number] as Entry[0]]?: string;
};

/** &amp; 必须最后还原，否则先解开的 &lt; 会被再解一次。 */
const ENTITY_REWRITES: ReadonlyArray<readonly [string, string]> = [
  ["&quot;", '"'],
  ["&apos;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&amp;", "&"],
];

const TOOL_UPDATE_RULES: ReadonlyArray<readonly [ToolUpdateStatus, readonly string[]]> = [
  ["failed", ["failed", "lost"]],
  ["stopped", ["stopped", "killed"]],
];

const TASK_NOTIFICATION_OPEN = "<task-notification>";

function decodeEntities(body: string): string {
  let decoded = body;
  for (const [from, to] of ENTITY_REWRITES) decoded = decoded.replaceAll(from, to);
  return decoded;
}

function readTag(source: string, tag: string): string | undefined {
  const matched = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "u").exec(source);
  const body = matched?.[1]?.trim();
  if (!body) return undefined;
  return decodeEntities(body);
}

function readNotification(source: string): KnorviaBackgroundTaskNotificationInfo {
  const info: KnorviaBackgroundTaskNotificationInfo = {};
  for (const [field, tag] of NOTIFICATION_TAGS) info[field] = readTag(source, tag);
  return info;
}

type ParsedTaskNotification = {
  notification: KnorviaBackgroundTaskNotificationInfo;
  toolUseId: string;
};

export function parseKnorviaBackgroundTaskNotificationText(
  source: string | undefined,
): ParsedTaskNotification | null {
  const content = source?.trim() ?? "";
  if (!content.startsWith(TASK_NOTIFICATION_OPEN)) return null;
  const toolUseId = readTag(content, "tool-use-id");
  if (!toolUseId) return null;
  return { notification: readNotification(content), toolUseId };
}

export function collectKnorviaBackgroundTaskNotificationsByToolUseId(
  batch: readonly KnorviaMessageWithParts[],
): Map<string, KnorviaBackgroundTaskNotificationInfo> {
  const found = new Map<string, KnorviaBackgroundTaskNotificationInfo>();
  const userMessages = batch.filter((entry) => entry.info.role === "user");
  for (const entry of userMessages) {
    const parsed = parseKnorviaBackgroundTaskNotificationText(
      textFromKnorviaMessageParts(entry.parts),
    );
    if (parsed) found.set(parsed.toolUseId, parsed.notification);
  }
  return found;
}

export function knorviaBackgroundTaskNotificationToolUpdateStatus(
  rawStatus: string | undefined,
): ToolUpdateStatus {
  // killed / stopped 是中止，不能记成 completed，否则卡片会画成成功结束。
  const rule = TOOL_UPDATE_RULES.find(
    ([, statuses]) => rawStatus !== undefined && statuses.includes(rawStatus),
  );
  return rule?.[0] ?? "completed";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function replaceKey(
  source: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return { ...source, [key]: value };
}

export function attachKnorviaBackgroundTaskNotificationToRaw(
  raw: unknown,
  info: KnorviaBackgroundTaskNotificationInfo | undefined,
): unknown {
  if (!info) return raw;
  const record = asRecord(raw);
  const metadata = asRecord(record._meta);
  const knorvia = asRecord(metadata.knorvia);
  const nextKnorvia = replaceKey(knorvia, "taskNotification", info);
  const nextMeta = replaceKey(metadata, "knorvia", nextKnorvia);
  return replaceKey(record, "_meta", nextMeta);
}
