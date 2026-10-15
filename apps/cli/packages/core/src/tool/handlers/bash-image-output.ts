// SPDX-License-Identifier: Apache-2.0
// bash 图片输出：stdout 可能是 data URL 形式的截图/图片，识别后交给图像端口
// 按预算缩放再回灌；端口缺席或处理失败时按「已验证的原图优先」原则回退，
// 坏图不进 provider（best-effort 能力，失败退文本）。
import { readFile, stat } from "node:fs/promises";
import {
  READ_IMAGE_MAX_DIMENSION,
  detectImageMediaType,
  isImageProcessorPortError,
  parseImageDataUrl,
  type ParsedImageDataUrl,
  type TraceContext,
} from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";

const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;

interface BashImageSource {
  /** artifact 路径优先（大图落盘），缺失时用内联 stdout 文本。 */
  artifactPath?: string;
  /** 已知的落盘字节数；缺席时再 stat 一次。 */
  artifactSize?: number;
  inline: string;
}

/** 缩放尝试的结果：成功给出新 data URL，失败携带原始异常交回上层裁决。 */
type ResizeOutcome = { scaled: string } | { failure: unknown };

export async function prepareBashImageOutput(
  origin: BashImageSource,
  ctx: ToolExecutionContext,
): Promise<{ stdout: string } | undefined> {
  const originText = await loadOriginText(origin);
  const image = parseImageDataUrl(originText);
  if (!image) return undefined;
  if (!ctx.imageProcessorPort) return { stdout: image.dataUrl };

  const outcome = await resizeWithinBudget(image, ctx);
  if ("scaled" in outcome) return { stdout: outcome.scaled };
  if (!worthRetryingWithoutResize(outcome.failure)) return undefined;
  return verifiedOriginalImage(image);
}

async function resizeWithinBudget(
  image: ParsedImageDataUrl,
  ctx: ToolExecutionContext,
): Promise<ResizeOutcome> {
  try {
    const processor = ctx.imageProcessorPort;
    const resized = await processor?.resizeToFit(
      {
        data: image.data,
        maxDimension: READ_IMAGE_MAX_DIMENSION,
        mediaType: image.mediaType,
        trace: buildToolTrace(ctx),
      },
      { signal: ctx.abortSignal },
    );
    if (!resized) return { failure: new Error("image processor unavailable") };
    const encodedPayload = Buffer.from(resized.data).toString("base64");
    return { scaled: `data:${resized.mediaType};base64,${encodedPayload}` };
  } catch (failure) {
    if (ctx.abortSignal.aborted) throw failure;
    return { failure };
  }
}

async function loadOriginText(origin: BashImageSource): Promise<string> {
  if (!origin.artifactPath) return origin.inline;
  try {
    const knownSize = origin.artifactSize ?? (await stat(origin.artifactPath)).size;
    if (knownSize > MAX_IMAGE_FILE_BYTES) return origin.inline;
    return await readFile(origin.artifactPath, "utf8");
  } catch {
    // 图片识别是 provider-visible 增强；artifact 临时文件缺失时回退 inline 输出，保留 Bash 原始结果。
    return origin.inline;
  }
}

// 图片 stdout 已通过 magic 校验时，缩放只是模型预算优化；
// 优化失败不能把模型可见的 image block 降级成原始 data URI 文本。
function verifiedOriginalImage(image: ParsedImageDataUrl): { stdout: string } | undefined {
  const detectedType = detectImageMediaType(image.data);
  if (detectedType === undefined || detectedType !== image.mediaType) return undefined;
  return { stdout: image.dataUrl };
}

// 端口错误里只有「处理失败」值得原图回退，其余直接放弃（坏图不进 provider）。
function worthRetryingWithoutResize(failure: unknown): boolean {
  if (!isImageProcessorPortError(failure)) return true;
  return failure.code === "processing_failed";
}

function buildToolTrace(ctx: ToolExecutionContext): TraceContext {
  const trace = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: ctx.parentSpanId,
    sessionId: ctx.sessionId,
    turnId: ctx.turnId,
    attributes: {
      toolCallId: ctx.toolCallId,
      toolName: "Bash",
    },
  };
  return trace as unknown as TraceContext;
}
