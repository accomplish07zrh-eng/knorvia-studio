import { isAbsolute, resolve } from "node:path";
import {
  KNORVIA_MCP_BROWSER_SCREENSHOT_CONTENT_INDICES_META_KEY,
  type McpContentBlock,
  type McpToolCallResult,
  type McpToolDescriptor,
  type TraceContext,
} from "@knorvia/contracts";
import {
  isOfficialCuaImageRefText,
  OFFICIAL_CUA_FRAME_INTEGRITY_META_KEY,
} from "@knorvia/cua/frame-contract";
import type { ToolExecutionContext } from "../tool/types.js";
import { preserveOfficialCuaFrameResult } from "@knorvia/cua/frame-contract";

export const MCP_IMAGE_INLINE_BASE64_BYTES: number = 200 * 1024;
export const MCP_IMAGE_INLINE_RAW_BYTES: number = Math.floor(
  (MCP_IMAGE_INLINE_BASE64_BYTES * 3) / 4,
);
export const HOST_NODE_REPL_IMAGE_MAX_DIMENSION = 2048;

export async function normalizeMcpToolResultForModel(input: {
  compressOversizedImages: boolean;
  context: ToolExecutionContext;
  descriptor: McpToolDescriptor;
  preserveOfficialCuaFrames?: boolean;
  result: McpToolCallResult;
  toolName: string;
}): Promise<McpToolCallResult> {
  // 具名步骤一：判定是否整体转交 @knorvia/cua（共享 node 上下文里带帧权威，或调用方显式要求）。
  const sharedNodeContext =
    input.descriptor.serverName === "node_repl" || input.toolName === "mcp__node_repl__js";
  const hasFrameAuthority = sharedNodeContext && hasOfficialCuaFrameAuthority(input.result);
  if (input.preserveOfficialCuaFrames === true || hasFrameAuthority) {
    const preserved = await preserveOfficialCuaFrameResult(input.result, {
      imageProcessorPort: input.context.imageProcessorPort,
      signal: input.context.abortSignal,
    });
    return preserved;
  }

  const screenshotIndices = input.compressOversizedImages
    ? markedScreenshotIndices(input.result)
    : new Set<number>();
  const content: McpContentBlock[] = [];
  let changed = false;
  for (const [index, entry] of input.result.content.entries()) {
    const screenshotPath = screenshotIndices.has(index)
      ? await backUpScreenshot({ context: input.context, toolName: input.toolName }, entry)
      : undefined;
    const entryInput: NormalizationInput = {
      compressOversizedImages: input.compressOversizedImages,
      context: input.context,
      descriptor: input.descriptor,
      preserveOfficialCuaFrames: input.preserveOfficialCuaFrames,
      result: input.result,
      toolName: input.toolName,
    };
    const normalized = await projectEntry(entryInput, entry, screenshotPath);
    // 官方 CUA 图片引用文本不进模型上下文：它是帧的引用标记，不是可读内容。
    if (isOfficialCuaImageRefTextBlock(normalized)) {
      changed = true;
      continue;
    }
    if (normalized !== entry) changed = true;
    content.push(normalized);
    // 备份过的浏览器截图在内容之后追加一行落盘位置，调用方据此向用户展示。
    if (screenshotPath !== undefined) {
      content.push({ type: "text", text: `Browser screenshot saved to: ${screenshotPath}` });
      changed = true;
    }
  }
  return changed ? { ...input.result, content } : input.result;
}

const isOfficialCuaImageRefTextBlock = (block: McpContentBlock): boolean =>
  block.type === "text" &&
  typeof block.text === "string" &&
  isOfficialCuaImageRefText(block.text);

export function hasOfficialCuaFrameAuthority(result: unknown): result is McpToolCallResult {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const candidate = result as McpToolCallResult;
  const content = candidate.content;
  if (!Array.isArray(content) || !candidate._meta?.[OFFICIAL_CUA_FRAME_INTEGRITY_META_KEY]) {
    return false;
  }
  return content.some((entry, index) => {
    if (!entry || typeof entry !== "object" || entry.type !== "image") return false;
    const next = content[index + 1];
    return typeof next?.text === "string" && isOfficialCuaImageRefText(next.text);
  });
}

export function asDataUrl(data: string, mimeType: string): string {
  return data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
}

export function base64PayloadFromMcpImageData(data: string): string {
  if (!data.startsWith("data:")) return data;
  const comma = data.indexOf(",");
  return comma < 0 ? data : data.slice(comma + 1);
}

type NormalizationInput = Parameters<typeof normalizeMcpToolResultForModel>[0];
type ImageSummary = { base64Bytes: number; inlineLimitBytes: number; mimeType: string };

function markedScreenshotIndices(result: McpToolCallResult): Set<number> {
  const marked =
    result._meta?.[KNORVIA_MCP_BROWSER_SCREENSHOT_CONTENT_INDICES_META_KEY] ??
    result._meta?.["knorvia/browserScreenshotContentIndices"];
  const indices = new Set<number>();
  if (Array.isArray(marked)) {
    for (const index of marked) {
      if (
        typeof index === "number" &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < result.content.length
      )
        indices.add(index);
    }
  }
  return indices;
}

async function backUpScreenshot(
  input: Pick<NormalizationInput, "context" | "toolName">,
  entry: McpContentBlock,
): Promise<string | undefined> {
  if (entry.type !== "image") return undefined;
  const data = entry.data;
  const mimeType = entry.mimeType;
  if (typeof data !== "string" || !data || typeof mimeType !== "string" || !mimeType)
    return undefined;
  const store = input.context.artifactStore;
  const write = store?.writeToolResultBinaryArtifact;
  if (!store || !write) return undefined;
  const bytes = Buffer.from(base64PayloadFromMcpImageData(data), "base64");
  if (bytes.byteLength === 0) return undefined;
  const toolName = input.toolName;
  try {
    const artifact = await write.call(
      store,
      {
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        toolCallId: input.context.toolCallId,
        toolName,
        content: bytes,
        contentType: mimeType,
        extension: extensionForMime(mimeType),
        retention: "session",
        trace: artifactTrace(input.context),
      },
      { signal: input.context.abortSignal },
    );
    if (!artifact.path) return undefined;
    return isAbsolute(artifact.path) ? artifact.path : resolve(artifact.path);
  } catch (error) {
    if (input.context.abortSignal.aborted) throw error;
    return undefined;
  }
}

// 省略/保存路径的两条补充说明：截图邻接提示与缺少 artifact store 的提示都是兼容面文案。
const SCREENSHOT_ADJACENT_NOTE =
  "The original browser screenshot remains available at the adjacent absolute path.";
const NO_ARTIFACT_STORE_NOTE =
  "No artifact store is configured, so the original image could not be saved.";

const textBlock = (lines: string[]): McpContentBlock => ({ type: "text", text: lines.join("\n") });

async function projectEntry(
  input: NormalizationInput,
  entry: McpContentBlock,
  screenshotPath: string | undefined,
): Promise<McpContentBlock> {
  if (entry.type !== "image") return entry;
  const data = entry.data;
  const mimeType = entry.mimeType;
  if (typeof data !== "string" || !data || typeof mimeType !== "string" || !mimeType) return entry;
  const payload = base64PayloadFromMcpImageData(data);
  const base64Bytes = Buffer.byteLength(payload, "utf8");
  // 未超过内联上限：返回入参本身，调用方据此判定内容未变化（不复制、不重写）。
  const withinInlineLimit = base64Bytes <= MCP_IMAGE_INLINE_BASE64_BYTES;
  if (withinInlineLimit) return entry;
  if (input.compressOversizedImages) {
    const compressed = await compressForInline(input, payload, mimeType);
    if (compressed) return compressed;
  }

  const summary: ImageSummary = {
    base64Bytes,
    inlineLimitBytes: MCP_IMAGE_INLINE_BASE64_BYTES,
    mimeType,
  };
  if (screenshotPath) {
    return textBlock([omittedImageMessage(summary), SCREENSHOT_ADJACENT_NOTE]);
  }
  if (!input.context.artifactStore) {
    return textBlock([omittedImageMessage(summary), NO_ARTIFACT_STORE_NOTE]);
  }
  const artifact = await saveOversizedImage(input, data, payload, summary);
  const savedNotice = `MCP image content saved instead of being inlined: ${summary.mimeType}, base64=${sizeLabel(summary.base64Bytes)}, inlineLimit=${sizeLabel(summary.inlineLimitBytes)}.`;
  return textBlock([
    savedNotice,
    `Artifact: ${artifact.path ?? artifact.uri}`,
    `Artifact URI: ${artifact.uri}`,
  ]);
}

// 压缩目标边长：与内联上限一起决定压缩结果是否可替换原图。
const COMPRESS_MAX_DIMENSION = 2000;

async function compressForInline(
  input: NormalizationInput,
  payload: string,
  mimeType: string,
): Promise<McpContentBlock | undefined> {
  const processor = input.context.imageProcessorPort;
  if (!processor) return undefined;
  const bytes = Buffer.from(payload, "base64");
  if (bytes.byteLength === 0) return undefined;
  try {
    const prepared = await processor.prepareForModel(
      {
        data: bytes,
        maxBase64Bytes: MCP_IMAGE_INLINE_BASE64_BYTES,
        maxDimension: COMPRESS_MAX_DIMENSION,
        maxRawBytes: MCP_IMAGE_INLINE_RAW_BYTES,
        mediaType: mimeType,
        trace: artifactTrace(input.context),
      },
      { signal: input.context.abortSignal },
    );
    const data = Buffer.from(prepared.data).toString("base64");
    const size = Buffer.byteLength(data, "utf8");
    // 压缩结果必须非空、未超内联上限、且仍是图片，才允许替换原图；否则交回回落路径。
    const isUsableInlineImage =
      size > 0 && size <= MCP_IMAGE_INLINE_BASE64_BYTES && prepared.mediaType.startsWith("image/");
    if (!isUsableInlineImage) return undefined;
    return { type: "image", data, mimeType: prepared.mediaType };
  } catch (error) {
    if (input.context.abortSignal.aborted) throw error;
    return undefined;
  }
}

async function saveOversizedImage(
  input: NormalizationInput,
  data: string,
  payload: string,
  summary: ImageSummary,
) {
  const dataUrl = asDataUrl(data, summary.mimeType);
  const store = input.context.artifactStore;
  if (!store) throw new Error("MCP image artifact store is not configured");
  const write = store.writeToolResultBinaryArtifact;
  if (write) {
    return await write.call(
      store,
      {
        sessionId: input.context.sessionId,
        turnId: input.context.turnId,
        toolCallId: input.context.toolCallId,
        toolName: input.toolName,
        content: Buffer.from(payload, "base64"),
        contentType: summary.mimeType,
        extension: extensionForMime(summary.mimeType),
        retention: "session",
        trace: artifactTrace(input.context),
      },
      { signal: input.context.abortSignal },
    );
  }
  return await store.writeToolResultArtifact(
    {
      sessionId: input.context.sessionId,
      turnId: input.context.turnId,
      toolCallId: input.context.toolCallId,
      toolName: input.toolName,
      content: JSON.stringify(
        {
          type: "mcp-image-artifact",
          createdAt: new Date().toISOString(),
          dataUrl,
          registeredToolName: input.toolName,
          serverName: input.descriptor.serverName,
          toolName: input.descriptor.toolName,
          ...summary,
        },
        null,
        2,
      ),
      contentType: "application/json",
      retention: "session",
      trace: artifactTrace(input.context),
    },
    { signal: input.context.abortSignal },
  );
}

function artifactTrace(context: ToolExecutionContext): TraceContext {
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    sessionId: context.sessionId,
    turnId: context.turnId,
  };
}

function extensionForMime(mimeType: string): string {
  switch ((mimeType.split(";")[0] ?? "").trim().toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    default:
      return ".bin";
  }
}

// 人类可读的字节标签：单位阶梯与整数/一位小数的分界都是兼容面。
const SIZE_UNIT_LADDER = ["B", "KiB", "MiB", "GiB"] as const;
const BYTES_PER_UNIT = 1024;
const DECIMAL_THRESHOLD = 10;

function omittedImageMessage(summary: ImageSummary): string {
  const actualSize = sizeLabel(summary.base64Bytes);
  const inlineLimit = sizeLabel(summary.inlineLimitBytes);
  return `MCP image content omitted: ${summary.mimeType}, base64=${actualSize} exceeds inline limit ${inlineLimit}.`;
}

function sizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let unitIndex = 0;
  let scaled = bytes;
  while (scaled >= BYTES_PER_UNIT && unitIndex < SIZE_UNIT_LADDER.length - 1) {
    scaled = scaled / BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const isBaseUnitOrLarge = unitIndex === 0 || scaled >= DECIMAL_THRESHOLD;
  const amount = isBaseUnitOrLarge ? Math.round(scaled).toString() : scaled.toFixed(1);
  return `${amount} ${SIZE_UNIT_LADDER[unitIndex]}`;
}
