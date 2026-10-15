// SPDX-License-Identifier: Apache-2.0
// 工具结果媒体落盘（B12）：内容里只有「文本块 + data URL 媒体块」且至少含一个媒体块时，
// 逐块串行写入产物库，返回 FilePart 附件与布局表（记录每块是文本还是第几个附件）；
// 其余情况返回 undefined。块来源已有 artifact URI 时直接复用，不重复写（幂等点）。
// 写入顺序与内容块顺序一致并携带取消信号；产物全部经注入端口，本模块不持有句柄。
import { isArtifactUri } from "@knorvia/shared";
import type { FilePart } from "@knorvia/contracts";
import { createPartId } from "../../deps.js";
import type {
  AttachmentStorageMetadata,
  MessageId,
  ModelMessageContent,
  ModelMessageContentBlock,
  SessionId,
  SessionStorePort,
  ToolArtifactStorePort,
  TraceContext,
  TurnId,
} from "../../deps.js";

// 缺产物库时的错误文案：逐字冻结（调用方按文案识别）。
const MISSING_ARTIFACT_STORE_MESSAGE = "Cannot persist tool result media without an artifact store";

// 布局表条目：文本块留原文。
export interface LayoutTextEntry {
  type: "text";
  text: string;
}

// 布局表条目：媒体块记「它是第几个附件」。
export interface LayoutAttachmentEntry {
  type: "attachment";
  attachmentIndex: number;
}

export type PersistedLayoutEntry = LayoutTextEntry | LayoutAttachmentEntry;

type MediaPiece = Extract<ModelMessageContentBlock, { type: "image" | "file" | "video" }>;

// 内容准入的投影结果：媒体清单 + 布局表，两者顺序都与内容块一致。
type ContentDigest = {
  mediaPieces: MediaPiece[];
  layout: PersistedLayoutEntry[];
};

export interface PersistToolMediaInput {
  // 附件记录挂回的助手消息 id。
  assistantMessageId: MessageId;
  sessionId: /* 会话标识：产物按会话保留 */ SessionId;
  turnId: /* 回合标识：产物挂回当前回合 */ TurnId;
  toolCallId: string;
  toolName: string;
  // 模型内容：只认「文本块 + data URL 媒体块」的混合，出现第三类块整体放弃落盘。
  content: ModelMessageContent;
  sessionStore?: /* 会话存储缺席即放弃落盘 */ SessionStorePort;
  artifactStore?: ToolArtifactStorePort;
  signal?: /* 取消信号随每次产物写入透传 */ AbortSignal;
  traceContext: TraceContext;
}

// 落盘结果：附件记录 + 布局表。
export type PersistedToolMediaResult = {
  attachments: FilePart[]; // 附件记录，顺序与媒体块一致
  modelContentLayout: PersistedLayoutEntry[];
};

// 媒体块准入：image/video 要求 data URL 以 `data:` 开头；file 同规，无可用文本的文件块才算媒体。
function dataUrlMediaPiece(piece: ModelMessageContentBlock): MediaPiece | undefined {
  if (piece.type === "image" || piece.type === "video") {
    return piece.dataUrl.startsWith("data:") ? piece : undefined;
  }
  return piece.type === "file" && piece.dataUrl?.startsWith("data:") ? piece : undefined;
}

// 内容准入：逐块分类成布局表 + 媒体清单；出现非文本/非媒体块或没有媒体块就放弃（undefined）。
function projectContentDigest(content: ModelMessageContent): ContentDigest | undefined {
  if (!Array.isArray(content) || content.length === 0) return undefined;
  const mediaPieces: MediaPiece[] = [];
  const layout: PersistedLayoutEntry[] = [];
  for (const piece of content) {
    if (piece.type === "text") {
      layout.push({ type: "text", text: piece.text });
    } else {
      const media = dataUrlMediaPiece(piece);
      if (!media) return undefined;
      layout.push({ type: "attachment", attachmentIndex: mediaPieces.length });
      mediaPieces.push(media);
    }
  }
  return mediaPieces.length > 0 ? { mediaPieces, layout } : undefined;
}

// 附件记录的存储元数据：storageKind=artifact、recoverability=provider_ready 是协议枚举。
function attachmentMetadata(piece: MediaPiece, uri: string): AttachmentStorageMetadata {
  const source = piece.source;
  const metadata: AttachmentStorageMetadata = {
    artifactUri: uri,
    storageKind: "artifact", // 协议枚举：产物存储
    recoverability: "provider_ready", // 协议枚举：可直接发给 provider
  };
  if (source?.sizeBytes !== undefined) metadata.sizeBytes = source.sizeBytes;
  if (source?.sha256) metadata.sha256 = source.sha256;
  return metadata;
}

// 附件记录的文件名：file 块的 name 优先，其次来源占位名；都没有就不带 filename 字段。
function attachmentFileName(piece: MediaPiece): string | undefined {
  if (piece.type === "file" && piece.name) return piece.name;
  return piece.source?.placeholder;
}

export const persistToolResultMediaAttachments = async (
  request: PersistToolMediaInput,
): Promise<PersistedToolMediaResult | undefined> => {
  if (!request.sessionStore) return undefined;
  const digest = projectContentDigest(request.content);
  if (!digest) return undefined;
  if (!request.artifactStore) {
    throw new Error(MISSING_ARTIFACT_STORE_MESSAGE);
  }

  const records: FilePart[] = [];
  // 串行写入：逐块等上一块落盘完成再写下一块，顺序与内容块顺序一致（契约事件序列）。
  for (let ordinal = 0; ordinal < digest.mediaPieces.length; ordinal += 1) {
    const piece = digest.mediaPieces[ordinal];
    const existingUri = isArtifactUri(piece.source?.uri) ? piece.source!.uri : undefined;
    const resolvedUri =
      existingUri ??
      (
        await request.artifactStore.writeToolResultArtifact(
          {
            content: piece.dataUrl!,
            contentType: "text/plain", // data URL 本身就是文本，按文本产物写入
            retention: "session", // 保留策略：跟随会话
            sessionId: request.sessionId,
            toolCallId: `${request.toolCallId}-media-${ordinal + 1}`,
            toolName: request.toolName,
            trace: request.traceContext,
            turnId: request.turnId,
          },
          { signal: request.signal },
        )
      ).uri;

    const filename = attachmentFileName(piece);
    records.push({
      id: createPartId(), // 每条附件一个新 part id
      messageID: request.assistantMessageId,
      sessionID: request.sessionId,
      type: "file",
      mime: piece.mediaType,
      ...(filename ? { filename } : {}),
      url: resolvedUri,
      metadata: attachmentMetadata(piece, resolvedUri),
    });
  }

  return { attachments: records, modelContentLayout: digest.layout };
};
