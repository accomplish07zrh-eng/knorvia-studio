// SPDX-License-Identifier: Apache-2.0
// 图片附件的内联预处理（B4）。
// 没有注入图像处理器时原样透传；有处理器时把 base64 载荷解码后交给处理器缩放，再把结果
// 编码回 data URL 并附带尺寸元数据。载荷必须是 `;base64,` 形式，否则返回 undefined 交由
// 上层按无效附件降级；处理器抛错不在本模块捕获，由调用方翻译成占位项（B7）。

import {
  READ_IMAGE_MAX_BASE64_BYTES,
  READ_IMAGE_TARGET_BYTES,
  type ImageProcessorPort,
  type TraceContext,
} from "../../deps.js";
import { MAX_IMAGE_ATTACHMENT_DIMENSION } from "../../types.js";
import type { PreparedImageData } from "../../types.js";

// 常见图片扩展名 → 媒体类型；表外一律按 png 兜底（与系统截图的默认格式一致）。
const IMAGE_EXTENSION_MEDIA: Readonly<Record<string, string>> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};
const FALLBACK_IMAGE_MEDIA = "image/png";

// 行终止符不允许出现在内联 base64 载荷里（RFC 2397 的 data URL 是单行文本）。
const BASE64_IMAGE_URL_PATTERN = /^data:[^;,]+;base64,([^\r\n\u2028\u2029]*)$/u;

export async function prepareImageDataUrl(
  sourceDataUrl: string,
  declaredMedia: string,
  settings: {
    abortSignal?: AbortSignal;
    // 图像处理器缺席即走透传分支：原样返回，不做任何缩放。
    imageProcessorPort?: ImageProcessorPort;
    traceContext: TraceContext;
  },
): Promise<PreparedImageData | undefined> {
  const payload = base64PayloadOf(sourceDataUrl);
  if (!payload) {
    // 载荷缺失或不是 base64 形态：上层按「无效图片附件」降级。
    return undefined;
  }
  const processor = settings.imageProcessorPort;
  if (!processor) {
    return { dataUrl: sourceDataUrl, mediaType: declaredMedia };
  }

  const scaled = await processor.prepareForModel(
    {
      data: Buffer.from(payload, "base64"),
      // 缩放预算三参数：base64 上限、边长上限、原始字节上限，全部来自运行时常量。
      maxBase64Bytes: /* 单图 base64 预算 */ READ_IMAGE_MAX_BASE64_BYTES,
      maxDimension: /* 边长上限 */ MAX_IMAGE_ATTACHMENT_DIMENSION,
      maxRawBytes: /* 原始字节上限 */ READ_IMAGE_TARGET_BYTES,
      mediaType: declaredMedia,
      trace: settings.traceContext,
    },
    { signal: settings.abortSignal },
  );
  const finalMedia = scaled.mediaType || declaredMedia;
  return {
    dataUrl: `data:${finalMedia};base64,${Buffer.from(scaled.data).toString("base64")}`,
    mediaType: finalMedia,
    metadata: {
      height: scaled.height,
      maxDimension: /* 回报给事件的边长上限，与请求同源 */ MAX_IMAGE_ATTACHMENT_DIMENSION,
      originalHeight: scaled.originalHeight,
      originalWidth: scaled.originalWidth,
      resized: scaled.resized,
      transformedSizeBytes: scaled.transformedSizeBytes,
      width: scaled.width,
    },
  };
}

// 按扩展名推断图片媒体类型；大小写不敏感，表外扩展名按 png 兜底。
export function inferImageMimeFromPath(filePath: string): string {
  const lowered = filePath.toLowerCase();
  for (const [suffix, media] of Object.entries(IMAGE_EXTENSION_MEDIA)) {
    if (lowered.endsWith(suffix)) {
      return media;
    }
  }
  return FALLBACK_IMAGE_MEDIA;
}

// 取出 `data:<类型>;base64,<载荷>` 的载荷段；结构不符或载荷为空都返回 undefined。
function base64PayloadOf(sourceDataUrl: string): string | undefined {
  return BASE64_IMAGE_URL_PATTERN.exec(sourceDataUrl)?.[1] ?? undefined;
}
