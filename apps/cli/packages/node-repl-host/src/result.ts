// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import {
  KNORVIA_MCP_BROWSER_SCREENSHOT_CONTENT_INDICES_META_KEY as SCREENSHOTS,
  KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY as APP,
} from "@knorvia/contracts/mcp";
import { CUA_APP_ASSOCIATIONS_META_KEY } from "@knorvia/cua/host-display-contract";
import type { NodeReplRunResult, NodeReplStructuredResult } from "@knorvia/core/repl";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { layoutResult, type ResultLayout } from "./result-layout.js";

const PROTECTED_FIELDS = new Set([
  SCREENSHOTS,
  APP,
  CUA_APP_ASSOCIATIONS_META_KEY,
  "knorvia/browserScreenshotContentIndices",
  "knorvia/nodeReplCuaApp",
  "knorvia.cua/app-associations-v1",
]);

function fallbackPresentation(value: string | undefined): NodeReplStructuredResult[] {
  if (value === undefined) return [];
  try {
    const decoded: unknown = JSON.parse(value.replace(/^\s*=>\s*/, ""));
    if (decoded === null || typeof decoded !== "object" || !("content" in decoded)) return [];
    const blocks: unknown = decoded.content;
    if (Array.isArray(blocks) && blocks.every((block) => block && typeof block.type === "string")) {
      return [decoded as NodeReplStructuredResult];
    }
  } catch {
    /* A plain final value is still valid text output. */
  }
  return [];
}

function resultMetadata(
  run: NodeReplRunResult,
  presentations: NodeReplStructuredResult[],
  layout: ResultLayout,
): Record<string, unknown> {
  // Object.assign 会把 JSON 的 __proto__ 键交给原型 setter；spread 将它保留为普通自有键。
  let meta: Record<string, unknown> = { ...run.responseMeta };
  for (const presentation of presentations) meta = { ...meta, ...presentation._meta };
  for (const key of PROTECTED_FIELDS) delete meta[key];
  if (run.cuaApp) meta[APP] = run.cuaApp;

  const positions = new Set<number>();
  for (const observed of run.browserScreenshotImageIndices ?? []) {
    const position = layout.imagePositions.get(observed);
    if (position !== undefined) positions.add(position);
  }
  if (positions.size) meta[SCREENSHOTS] = [...positions];
  if (layout.content.some((block) => block.type === "image"))
    meta["knorvia/nodeReplEmittedImage"] = true;
  return meta;
}

export function toMcpRunResult(run: NodeReplRunResult): CallToolResult {
  const explicit = Boolean(run.structuredResults?.length);
  const presentations = explicit
    ? run.structuredResults!
    : run.error
      ? []
      : fallbackPresentation(run.result);
  const layout = layoutResult(run, presentations, explicit);
  const meta = resultMetadata(run, presentations, layout);
  const result: CallToolResult = { content: layout.content };
  if (run.error || presentations.some((item) => item.isError)) result.isError = true;
  const data = presentations.findLast(
    (item) => item.structuredContent !== undefined,
  )?.structuredContent;
  if (data) result.structuredContent = data;
  if (Object.keys(meta).length) result._meta = meta;
  return result;
}
