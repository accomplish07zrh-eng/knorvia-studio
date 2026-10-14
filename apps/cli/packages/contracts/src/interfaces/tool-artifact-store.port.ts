// SPDX-License-Identifier: Apache-2.0
// 工具产物存储端口：把体积过大的工具结果挪出模型上下文，落到 artifact 存储里，再按 uri 取回。
// 端口由存储实现方（Host 侧）提供：落盘位置、命名与生命周期归它；工具运行时只交出内容与保留
// 意图。读回面刻意分成文本与原始字节两条路，编码策略不混在一个方法里。

// ── 章节：一 保留策略 · 二 写入面 · 三 读回面 · 四 元信息面 · 五 媒体附件路径 · 六 端口本体

import type { TraceContext } from "../tracing/tracer.js";
import type { SessionId, ToolCallId, TurnId } from "./shared.js";

// ── 一、保留策略 ────────────────────────────────────────────────────

/** 产物能活多久：跟随会话、跟随项目，或只在当前运行窗口内临时可用。 */
export type ToolArtifactRetention = "session" | "project" | "temporary";

// ── 二、写入面 ──────────────────────────────────────────────────────

/** 写入一份文本产物。`toolName` 与 `toolCallId` 把产物挂回调用链，`contentType` 省略时由 实现方按内容或扩展名判定；`retention` 省略同样由实现方取默认。 */
export interface ToolArtifactWriteRequest {
  sessionId: SessionId;
  turnId?: TurnId;
  toolCallId: ToolCallId | string;
  toolName: string;
  content: string;
  contentType?: string;
  retention?: ToolArtifactRetention;
  trace?: TraceContext;
}

/** 写入一份二进制产物。与文本写入同规，但 `contentType` 必须给出，`extension` 可提示落盘 扩展名——图片、文档这类非文本内容走这条路。 */
export interface ToolBinaryArtifactWriteRequest {
  sessionId: SessionId;
  turnId?: TurnId;
  toolCallId: ToolCallId | string;
  toolName: string;
  content: Uint8Array;
  contentType: string;
  extension?: string;
  retention?: ToolArtifactRetention;
  trace?: TraceContext;
}

/** 写入回执：稳定 id 与 uri 供后续读回与查询，路径、字节数与创建时间由实现方填写。 */
export interface ToolArtifactWriteResult {
  id: string;
  uri: string;
  path?: string;
  bytes: number;
  contentType: string;
  createdAt: Date;
}

// ── 三、读回面 ──────────────────────────────────────────────────────

/** 按 uri 取回产物的请求；`trace` 把这次读取并回调用链。 */
export interface ToolArtifactReadRequest {
  uri: string;
  trace?: TraceContext;
}

/** 文本读回结果：`content` 是已解码的字符串，`path` 在产物确实落在本地文件时给出。 */
export interface ToolArtifactReadResult {
  uri: string;
  content: string;
  contentType: string;
  bytes: number;
  path?: string;
}

// 二进制读回结果：`bytes` 是原封不动的字节，不经过文本或 base64 编解码。
// 写入侧的编码是按内容类型定的，而读回若靠文件名反推类型，推断表覆盖不到 `.xlsx` / `.docx` / `.pptx` 这类办公文档，它们会落进默认分支被当作文本解码——读回来就是坏数据， 且不可恢复。
// 需要字节的消费方（V4 分块查询、查看器）要的正是字节本身，编码只是给模型面 文本用的，两件事必须分开成两个方法。
// `contentType` 仍按文件名推断，仅供没有更可靠来源的调用方兜底（例如 dynamic workflow 记在 journal 里的那份）。 字段由存储实现方填充。
export interface ToolBinaryArtifactReadResult {
  uri: string;
  bytes: Uint8Array;
  contentType: string;
  path?: string;
}

// ── 四、元信息面 ────────────────────────────────────────────────────

/** 只问大小与类型、不取内容的请求。 */
export interface ToolArtifactStatRequest {
  uri: string;
  trace?: TraceContext;
}

/** 产物元信息：字节数与内容类型，外加实现方拿得到时的本地路径和最后修改时间。 */
export interface ToolArtifactStatResult {
  uri: string;
  bytes: number;
  contentType: string;
  path?: string;
  mtimeMs?: number;
}

// ── 五、媒体附件路径 ────────────────────────────────────────────────

/** 附件路径兑换的两种结局：给出可用本地路径，或声明该媒体类型不受支持。 */
export type MediaAttachmentPathResult =
  | { status: "ready"; path: string }
  | { status: "unsupported" };

/** 用已知字节预热一份图片附件的本地路径，避免实现方再取一次内容。 */
export interface ImageAttachmentPathPrimeRequest {
  uri: string;
  bytes: Uint8Array;
  mediaType: string;
}

/** 用已知字节预热一份媒体附件的本地路径。 */
export interface MediaAttachmentPathPrimeRequest {
  uri: string;
  bytes: Uint8Array;
  mediaType: string;
}

/** 只给媒体类型、不给字节，要求实现方保证路径就绪（必要时自行取回内容）。 */
export interface MediaAttachmentPathEnsureRequest {
  uri: string;
  mediaType: string;
}

// ── 六、端口本体 ────────────────────────────────────────────────────

/** 工具产物存储的能力面。文本写入与文本读回是必备项；二进制写入/读回、元信息查询与三条附件 路径方法都是可选项——消费方用 `typeof` 探测，缺席就表示这项能力不存在。 */
export interface ToolArtifactStorePort {
  writeToolResultArtifact(
    request: ToolArtifactWriteRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolArtifactWriteResult>;
  writeToolResultBinaryArtifact?(
    request: ToolBinaryArtifactWriteRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolArtifactWriteResult>;
  readToolResultArtifact(
    request: ToolArtifactReadRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolArtifactReadResult>;
  /** 原始字节读回（见 {@link ToolBinaryArtifactReadResult}）。与 {@link writeToolResultBinaryArtifact} 成对可选：没有二进制能力的实现不必陪跑；消费方用 `typeof` 探测，缺席即「本 store 给不出字节」，绝不退回文本读再自己解码。 */
  readToolResultBinaryArtifact?(
    request: ToolArtifactReadRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolBinaryArtifactReadResult>;
  statToolResultArtifact?(
    request: ToolArtifactStatRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolArtifactStatResult>;
  primeImageAttachmentPath?(
    request: ImageAttachmentPathPrimeRequest,
  ): Promise<MediaAttachmentPathResult>;
  primeMediaAttachmentPath?(
    request: MediaAttachmentPathPrimeRequest,
  ): Promise<MediaAttachmentPathResult>;
  ensureMediaAttachmentPath?(
    request: MediaAttachmentPathEnsureRequest,
  ): Promise<MediaAttachmentPathResult>;
}
