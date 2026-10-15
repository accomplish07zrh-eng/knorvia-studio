// SPDX-License-Identifier: Apache-2.0
// 附件产物库的读写与安全引用（B6）。
// 写入遵循「已有 artifact URI 直接复用」的幂等规则：有产物库与会话标识才真正落盘，否则
// 原样内联；写入异常向上冒泡（调用方决定重试或降级）。读取走相反的口径：任何异常都被吞
// 掉并返回 undefined，由调用方换成占位项。引用字段优先暴露路径，内联 data URL 归一成
// `inline:data-url`，避免把大段内容写进事件与日志。

import { isArtifactUri } from "@knorvia/shared";
import type {
  SessionId,
  ToolArtifactStorePort,
  TraceContext,
  TurnAttachment,
  TurnId,
} from "../../deps.js";

// 产物写入结果的元数据：URI 字段只在 artifact 形态出现，内联形态不带空串占位。
type PersistMetadata = {
  artifactUri?: /* 已落盘产物的引用 */ string;
  recoverability: /* 内容始终可重取 */ "provider_ready";
  storageKind: /* artifact=已持久化 / inline=随请求携带 */ "artifact" | "inline";
};

type AttachmentPersistReceipt = {
  metadata: PersistMetadata;
  url: string;
};

type RecoveredInlinePayload = {
  artifactUri?: /* 读回内容的来源产物 */ string;
  dataUrl: string;
};

const INLINE_URL_SCHEME = "data:";
const SAFE_INLINE_REF = "inline:data-url";
const ARTIFACT_CONTENT_TYPE = "text/plain";
const ARTIFACT_RETENTION = "session";

// 把内联 data URL 写入附件产物库（或在已有 URI 时直接复用）。返回的资源同时携带引用 URL
// 与存储形态：artifact 表示内容已持久化、模型请求只带 URI；inline 表示没有落盘条件。
export async function persistAttachmentDataUrl(
  source: string,
  ordinal: number,
  declaredMedia: string,
  settings: {
    abortSignal?: AbortSignal;
    artifactStore?: /* 产物库端口，缺席即不落盘 */ ToolArtifactStorePort;
    // 已有产物 URI：直接复用，不重复写库（幂等短路点）。
    existingArtifactUri?: string;
    sessionId?: /* 会话标识：与产物库同时在场才真正写库 */ SessionId;
    traceContext: TraceContext;
    turnId?: TurnId;
  },
): Promise<AttachmentPersistReceipt> {
  if (settings.existingArtifactUri) {
    return persistResult(settings.existingArtifactUri, "artifact");
  }

  const { artifactStore, sessionId } = settings;
  if (!artifactStore || !sessionId) {
    return persistResult(source, "inline");
  }

  const written = await artifactStore.writeToolResultArtifact(
    {
      content: source,
      contentType: ARTIFACT_CONTENT_TYPE,
      retention: ARTIFACT_RETENTION,
      sessionId,
      // 附件产物借用工具产物的标识约定：序号从 1 起，工具名带上媒体类型便于归档检索。
      toolCallId: `attachment-${ordinal + 1}`,
      toolName: `attachment:${declaredMedia}`,
      trace: settings.traceContext,
      turnId: settings.turnId,
    },
    { signal: settings.abortSignal },
  );
  return persistResult(written.uri, "artifact");
}

// 读回附件的内联内容：`data:` 开头的直接透传；artifact URI 经产物库读回并要求内容仍是
// data URL。读取失败（含产物不存在）一律返回 undefined，不向调用方抛错。
export async function readInlineAttachmentContent(
  item: TurnAttachment,
  settings: {
    artifactStore?: ToolArtifactStorePort;
    traceContext: TraceContext;
  },
): Promise<RecoveredInlinePayload | undefined> {
  const payload = item.content;
  if (!payload) {
    return /* 附件没有内联内容 */ undefined;
  }
  if (payload.startsWith(INLINE_URL_SCHEME)) {
    return { dataUrl: payload };
  }
  const store = settings.artifactStore;
  if (!store || !isArtifactUri(payload)) {
    // 既不是内联 data URL、也不是（可用的）产物 URI：没有可读的内容。
    return undefined;
  }
  // 读取失败（产物缺失、库端口异常）都被吞掉，降级成 undefined 交给上层换占位项。
  const artifact = await store
    .readToolResultArtifact({ trace: settings.traceContext, uri: payload })
    .catch(() => undefined);
  return artifact?.content.startsWith(INLINE_URL_SCHEME)
    ? { artifactUri: payload, dataUrl: artifact.content }
    : /* 读回内容不是 data URL */ undefined;
}

// 计算附件的安全引用：路径优先；data URL 内联内容归一成固定标记；无内容返回 undefined。
export function safeAttachmentOriginalRef(item: TurnAttachment): string | undefined {
  if (item.path) {
    return item.path;
  }
  const payload = item.content;
  if (!payload) {
    return undefined;
  }
  return payload.startsWith(INLINE_URL_SCHEME) ? SAFE_INLINE_REF : payload;
}

// 统一组装产物资源：artifact 形态额外携带 artifactUri，inline 形态只带内容引用。
function persistResult(url: string, kind: "artifact" | "inline"): AttachmentPersistReceipt {
  const metadata = {
    recoverability: /* 只要 URI 在手，内容随时可重取 */ "provider_ready",
    storageKind: kind,
  } as PersistMetadata;
  if (kind === "artifact") {
    metadata.artifactUri = url;
  }
  return { metadata, url };
}
