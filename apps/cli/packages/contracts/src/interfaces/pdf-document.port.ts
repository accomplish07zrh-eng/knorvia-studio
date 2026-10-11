// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// PDF 文档端口 —— 把本地 PDF 读成页数与页面图
// ════════════════════════════════════════════════════════════
// 模型看不见 PDF 的活页，能拿到的只有渲染之后的位图；对话里提到「第 3 页」时又需要先把总页数问出来。
// 落到边界上就是两件事：读页数、把指定页段渲染成 JPEG。渲染器怎么选、要不要起外部进程、超时与取消
// 怎么办，全部由实现侧承担，这里只写请求与结果。

// 所有权：文件路径由调用方给出，读取过程与中间产物归实现方管理；失败一律抛 PdfDocumentPortError，
// code 是调用方唯一应当依赖的分流依据。

// 章节：一 失败语汇 · 二 请求入参 · 三 渲染读数 · 四 端口本体

import type { TraceContext } from "../tracing/tracer.js";

// ── 一、失败语汇：打不开或渲染不出来时怎么归类 ───────────────────────

/** PDF 读取与渲染失败的原因分类。密码保护、页号越界、文件损坏这类用户可以自己修正的情况，与 io_error、process_failed 这类环境或实现侧的问题刻意分开——上层据此决定是提示改输入还是提示重试。 */
export type PdfDocumentErrorCode =
  | "cancelled"
  | "corrupted"
  | "io_error"
  | "page_out_of_range"
  | "password_protected"
  | "permission_denied"
  | "process_failed"
  | "timeout"
  | "unavailable";

/** 本端口对外抛出的唯一种错误。原因码在构造时以只读字段落到实例上，message 与 options 直接交给 Error 基类，因此 cause 走的是标准 ErrorOptions 通道。 */
export class PdfDocumentPortError extends Error {
  constructor(
    readonly code: PdfDocumentErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PdfDocumentPortError";
  }
}

// ── 二、请求入参：调用方要读哪一份文件 ───────────────────────────────

/** 只问页数的请求。filePath 指向调用方已经确认存在的文件；trace 每次都要带，读文件这种副作用必须能 归到发起它的那次会话任务上。 */
export interface PdfDocumentPageCountRequest {
  filePath: string;
  trace: TraceContext;
}

/** 在页数请求之上再加一对闭区间的页码，表示这次要渲染的是哪一段。 */
export interface PdfDocumentRenderPagesRequest extends PdfDocumentPageCountRequest {
  firstPage: number;
  lastPage: number;
}

// ── 三、渲染读数：交回来的页面图像 ───────────────────────────────────

/** 渲染好的一页：JPEG 字节，外加它在原文档里的页码，供调用方把图像放回正确的位置。 */
export interface PdfDocumentRenderedPage {
  data: Uint8Array;
  mediaType: "image/jpeg";
  pageNumber: number;
}

// ── 四、端口本体：两个动作，都可取消 ─────────────────────────────────

/** PDF 读取能力的完整形状。getPageCount 允许交回 undefined：有些文件的结构让实现给不出可靠页数， 这时候上层应当退回「按需渲染」，而不是把未知当成 0。renderPages 交回请求页段内的位图，每一张 都自带 pageNumber，调用方不必靠数组下标去猜。 */
export interface PdfDocumentPort {
  getPageCount(
    request: PdfDocumentPageCountRequest,
    options?: { signal?: AbortSignal },
  ): Promise<number | undefined>;
  renderPages(
    request: PdfDocumentRenderPagesRequest,
    options?: { signal?: AbortSignal },
  ): Promise<PdfDocumentRenderedPage[]>;
}
