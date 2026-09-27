// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY,
  nodeReplCuaAppDisplaySchema,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import { isRecord } from "../utils.js";

export const MAX_NODE_REPL_DISPLAY_IMAGE_BASE64_BYTES = 200 * 1024;
type Image = { base64: string; mimeType: string };
type Candidate = { kind: "skip" } | { kind: "oversized" } | { kind: "image"; image: Image };

function classify(candidate: unknown): Candidate {
  if (!isRecord(candidate)) return { kind: "skip" };
  const mimeType = candidate.mimeType;
  const encoded = candidate.base64 ?? candidate.data;
  if (
    typeof mimeType !== "string" ||
    !/^image\/[a-z0-9.+-]+$/iu.test(mimeType) ||
    typeof encoded !== "string"
  )
    return { kind: "skip" };
  const comma = encoded.startsWith("data:") ? encoded.indexOf(",") : -1;
  const base64 = encoded.slice(comma + 1);
  if (!base64 || Buffer.byteLength(base64, "utf8") > MAX_NODE_REPL_DISPLAY_IMAGE_BASE64_BYTES)
    return { kind: "oversized" };
  return { kind: "image", image: { base64, mimeType } };
}

export function createReplCard(
  toolName: string,
  output: unknown,
): ToolResultDisplayPayload | undefined {
  if (toolName !== "js" && toolName !== "mcp__node_repl__js") return;
  if (!isRecord(output)) return;
  const pending = [
    ...(Array.isArray(output.images) ? output.images : []),
    ...(Array.isArray(output.content) ? output.content : []),
  ];
  const images: Image[] = [];
  let omitted = false;
  for (const item of pending) {
    const candidate = classify(item);
    switch (candidate.kind) {
      case "skip":
        break;
      case "oversized":
        omitted = true;
        break;
      case "image":
        if (images.length === 2) omitted = true;
        else images.push(candidate.image);
        break;
    }
  }
  // 仅接受宿主产出的应用身份；producer 的可写关联信息不能作为备选来源。
  const metadata = isRecord(output._meta) ? output._meta : undefined;
  const parsed = nodeReplCuaAppDisplaySchema.safeParse(
    metadata?.[KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY],
  );
  if (!images.length && !parsed.success) return;
  return {
    kind: "node_repl_images",
    ...(images.length ? { images } : {}),
    ...(parsed.success ? { app: parsed.data } : {}),
    ...(omitted ? { truncated: true } : {}),
  };
}
