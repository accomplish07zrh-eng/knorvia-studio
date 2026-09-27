// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CUA_TARGET_APP_DISPLAY_META_KEY,
  cuaTargetAppDisplaySchema,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import {
  CUA_REQUEST_ACCESS_STATUS_META_KEY,
  cuaRequestAccessStatusSchema,
} from "@knorvia/cua/request-access-contract";
import { boundDisplayText } from "../display-text.js";
import { isRecord } from "../utils.js";

type InlineImage = { mimeType: string; data: string };
const TEXT_BYTES = 32768;
const IMAGE_BYTES = 262144;

export function computerAction(name: string): string | undefined {
  const normalized = name.trim().toLowerCase().replaceAll("-", "_");
  const boundary = normalized.lastIndexOf("__");
  if (boundary < 0 || !normalized.includes("computer_use")) return;
  return normalized.slice(boundary + 2) || undefined;
}

function resultText(content: unknown[]): string {
  const records = content.filter(isRecord);
  const selected: Record<string, unknown>[] = [];
  for (const record of records) {
    if (record.type === "text" && typeof record.text === "string") selected.push(record);
  }
  return selected.map((record) => record.text as string).join("\n");
}

function imageCandidate(item: unknown): { bytes: number; image: InlineImage } | undefined {
  if (
    !isRecord(item) ||
    item.type !== "image" ||
    typeof item.mimeType !== "string" ||
    typeof item.data !== "string"
  )
    return;
  const bytes = Buffer.byteLength(item.data, "base64");
  return { bytes, image: { mimeType: item.mimeType, data: item.data } };
}

function inlineMedia(content: unknown[]) {
  const media: InlineImage[] = [];
  let remaining = IMAGE_BYTES * 2;
  let truncated = false;
  for (const item of content) {
    const candidate = imageCandidate(item);
    if (!candidate) continue;
    // 数量满后停止；字节超限只跳过当前图片，让后续较小图片仍有机会展示。
    if (media.length === 4) {
      truncated = true;
      break;
    }
    if (candidate.bytes > IMAGE_BYTES || candidate.bytes > remaining) {
      truncated = true;
    } else {
      remaining -= candidate.bytes;
      media.push(candidate.image);
    }
  }
  return { media, truncated };
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

export function createComputerCard(
  action: string,
  output: unknown,
  trusted: boolean,
): ToolResultDisplayPayload {
  const result = isRecord(output) ? output : {};
  const content = Array.isArray(result.content) ? result.content : [];
  const text = resultText(content);
  const structured = result.structuredContent;
  const fields = isRecord(structured) ? structured : undefined;
  const error = isRecord(fields?.error) ? fields.error : undefined;
  const structuredField =
    structured === undefined ? undefined : boundDisplayText(jsonText(structured), TEXT_BYTES);
  const textField = text ? boundDisplayText(text, TEXT_BYTES) : undefined;
  const { media, truncated: mediaTruncated } = inlineMedia(content);
  const truncated =
    mediaTruncated || structuredField?.truncated === true || textField?.truncated === true;
  const metadata = isRecord(result._meta) ? result._meta : undefined;
  const target = trusted
    ? cuaTargetAppDisplaySchema.safeParse(metadata?.[CUA_TARGET_APP_DISPLAY_META_KEY])
    : undefined;
  // 保留安装包所提供的能力合同；展示层不能自行把不支持的权限状态改成成功。
  const permission =
    trusted && action === "request_access"
      ? cuaRequestAccessStatusSchema.safeParse(metadata?.[CUA_REQUEST_ACCESS_STATUS_META_KEY])
      : undefined;
  return {
    kind: "cua",
    schemaVersion: 1,
    toolName: action,
    status: result.isError === true ? "failed" : "success",
    ...(structuredField ? { structuredContent: structuredField.value } : {}),
    ...(textField ? { text: textField.value } : {}),
    ...(typeof error?.code === "string" ? { errorCode: error.code } : {}),
    ...(typeof error?.suggested_action === "string"
      ? { suggestedAction: error.suggested_action }
      : {}),
    ...(target?.success ? { targetApp: target.data } : {}),
    ...(permission?.success ? { permissionStatus: permission.data } : {}),
    ...(media.length ? { media } : {}),
    ...(truncated ? { truncated: true } : {}),
  };
}
