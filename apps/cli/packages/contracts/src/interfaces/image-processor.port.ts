// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// 图像处理端口 —— 图片送进模型之前的尺寸与体积整形
// ════════════════════════════════════════════════════════════
// 用户粘进来的截图与照片不会天生就适合送进模型：像素可能远超模型一次能看的上限，编码成 base64 之后
// 的字符数也可能把请求撑爆。本文件只描述「把一张图整到能送」这件事的对外形状，重采样、量化与换编码
// 格式之类的具体手法留给实现侧；调用方提出目标（长边上限、原始字节上限、base64 上限）并读回结果。

// 所有权：图像字节由调用方持有，实现不得就地改写传入的 data；失败一律以 ImageProcessorPortError
// 抛出，调用方只用 ImageProcessorErrorCode 分流，不要去嗅 message 文本。

// 章节：一 失败语汇 · 二 等比缩放 · 三 送模型前的压缩 · 四 端口本体

import type { TraceContext } from "../tracing/tracer.js";

// ── 一、失败语汇：处理没做成时怎么表达 ───────────────────────────────

/** 图片处理失败的原因分类；每一类都对应调用方一种可采取的动作（换图、缩小、重试或直接放弃）。 */
export type ImageProcessorErrorCode =
  | "empty"
  | "invalid_request"
  | "processing_failed"
  | "too_large"
  | "unsupported";

/** 构造端口错误需要的素材：code 定位原因，cause 用来保留编解码库那一层的原始失败。 */
export interface ImageProcessorErrorDetails {
  code: ImageProcessorErrorCode;
  message: string;
  cause?: unknown;
}

/** 本端口对外抛出的唯一种错误，由实现侧构造。message 走 Error 基类，稳定的原因码放在 code 上， 底层异常挂在 cause 上——上层既能按码分流，也还能一路追到真正失败的地方。 */
export class ImageProcessorPortError extends Error {
  readonly code: ImageProcessorErrorCode;
  override readonly cause?: unknown;

  constructor(details: ImageProcessorErrorDetails) {
    super(details.message);
    this.name = "ImageProcessorPortError";
    this.code = details.code;
    this.cause = details.cause;
  }
}

/** 判别时要比对的原型链候选构造器形状；只在文件内部使用，不对外导出。 */
type ImageProcessorErrorConstructor = new (
  details: ImageProcessorErrorDetails,
) => ImageProcessorPortError;

/** 端口错误的判别表：只认这些构造器，不检查 code 等字段，免得形状相近的普通对象被误判。 */
const IMAGE_PROCESSOR_ERROR_TYPES: readonly ImageProcessorErrorConstructor[] = [
  ImageProcessorPortError,
];

/** 按素材构造一个端口错误；跨模块边界传递错误时请走这个入口，保证 name 与字段始终一致。 */
export function createImageProcessorError(
  details: ImageProcessorErrorDetails,
): ImageProcessorPortError {
  return new ImageProcessorPortError(details);
}

/** 判断某个抛出物是不是本端口产生的。 */
export function isImageProcessorPortError(error: unknown): error is ImageProcessorPortError {
  return IMAGE_PROCESSOR_ERROR_TYPES.some((ErrorConstructor) => error instanceof ErrorConstructor);
}

// ── 二、等比缩放：只改尺寸，不碰内容 ─────────────────────────────────

/** 一次缩放请求：字节与媒体类型由调用方给出，maxDimension 划定长边的天花板。 */
export interface ImageResizeRequest {
  data: Uint8Array;
  mediaType: string;
  maxDimension: number;
  trace?: TraceContext;
}

/** 缩放读数。original* 是整之前的读数、width/height 是整之后的读数，两组都是可选的——实现拿不到 可信尺寸时允许留空，而不是拿 0 或者估算值顶上；resized 则回答这次调用究竟有没有真动过像素。 */
export interface ImageResizeResult {
  data: Uint8Array;
  mediaType: string;
  originalWidth?: number;
  originalHeight?: number;
  width?: number;
  height?: number;
  resized: boolean;
}

// ── 三、送模型前的压缩：尺寸与体积一起管 ─────────────────────────────

/** 结果里说明「这次用了哪种手段」，让调用方能够解释体积为什么变了。 */
export type ImageCompressionStrategy =
  | "original"
  | "preserve-format"
  | "png-optimized"
  | "png-quantized"
  | "resized"
  | "jpeg-quality"
  | "jpeg-fallback";

/** 面向模型请求的整形入参：在缩放目标之上多加 base64 与原始字节两道体积上限。 */
export interface ImagePrepareForModelRequest extends ImageResizeRequest {
  maxBase64Bytes: number;
  maxRawBytes: number;
  maxTokens?: number;
  tokenToBase64CharRatio?: number;
}

/** 整形结果：在缩放读数之上补三个读数——这次压没压（compressed）、压缩前后各占多少字节 （originalSizeBytes / transformedSizeBytes），以及最终采用的手段（strategy）。 */
export interface ImagePrepareForModelResult extends ImageResizeResult {
  compressed: boolean;
  originalSizeBytes: number;
  strategy: ImageCompressionStrategy;
  transformedSizeBytes: number;
}

// ── 四、端口本体：调用方只面对两个动作 ───────────────────────────────

/** 图像处理的全部能力面，由使用它的运行时装配并注入。两个动作都接受可选的 AbortSignal：用户中途 取消时，实现应尽快收手，不能把半成品充当结果交回来。 */
export interface ImageProcessorPort {
  resizeToFit(
    request: ImageResizeRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ImageResizeResult>;
  prepareForModel(
    request: ImagePrepareForModelRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ImagePrepareForModelResult>;
}
