// SPDX-License-Identifier: Apache-2.0
// 附件路径物化（B11）：user 消息里带 inline（artifact URI）或 local_file（本地路径）来源的
// 图片/视频/PDF 块，兑换出真实本地路径，并在消息末尾追加一条来源注记。
// 本地路径直接采用；artifact URI 经产物库物化；产物库明确回报 unsupported 就跳过该块。
// 消息之间与块之间都并发物化，结果按输入顺序落位；产物库是注入端口，本模块不持有句柄。
// 失败只靠异常语义暴露（文案 `Unable to materialize <kind> attachment path: <标签>`），
// 产物库抛出的原始错误作为 cause 保留；本模块不打日志。
import { isArtifactUri } from "@knorvia/shared";
import type {
  ModelInputMessage,
  ModelMessageContentBlock,
  ToolArtifactStorePort,
} from "../../deps.js";

type StorableMedia = Extract<ModelMessageContentBlock, { type: "image" | "video" | "file" }>;

// 物化结果：undefined 表示产物库明确不支持该媒体，跳过而不是报错。
type MaterializedPath = string | undefined;

// 产物库回了空路径时的内层错误文案，会被外层翻译成物化失败。
const EMPTY_DERIVED_PATH = "empty derived path";

// PDF 判定按媒体类型主值：去参数后缀、去空白、忽略大小写后比 application/pdf。
function isPdfPiece(piece: ModelMessageContentBlock): boolean {
  const base =
    piece.type === "file" ? piece.mediaType.split(";", 1)[0]?.trim().toLowerCase() : undefined;
  return base === "application/pdf";
}

// 可物化来源：inline 且是 artifact URI，或 local_file 且带本地路径；其余来源不参与物化。
function isMaterializableSource(piece: ModelMessageContentBlock): piece is StorableMedia {
  const source = "source" in piece ? piece.source : undefined;
  if (!source || (!isPdfPiece(piece) && piece.type !== "image" && piece.type !== "video")) {
    return false;
  }
  const inlineArtifact = source.kind === "inline" && isArtifactUri(source.uri);
  const localPathUsable = source.kind === "local_file" && Boolean(source.path);
  return inlineArtifact || localPathUsable;
}

// 物化失败的错误文案（协议文案）：`Unable to materialize <kind> attachment path: <标签>`；
// 产物库抛出的原始错误作为 cause 保留。
function materializationFailure(kind: string, label: string | undefined, cause?: unknown): Error {
  return new Error(`Unable to materialize ${kind} attachment path: ${label}`, {
    cause: cause instanceof Error ? cause : undefined,
  });
}

// 单块路径解析：local_file 直取；artifact URI 经产物库兑换；unsupported 返回 undefined。
async function materializeAttachmentPath(
  piece: StorableMedia,
  store: ToolArtifactStorePort | undefined,
): Promise<MaterializedPath> {
  const source = piece.source!;
  const kindLabel = isPdfPiece(piece) ? "pdf" : piece.type;
  const localPath = source.kind === "local_file" ? source.path : undefined;
  if (localPath) return localPath;

  const artifactUri = source.uri;
  if (!isArtifactUri(artifactUri) || !store?.ensureMediaAttachmentPath) {
    throw materializationFailure(kindLabel, source.placeholder ?? artifactUri ?? source.id);
  }
  return store
    .ensureMediaAttachmentPath({ mediaType: source.mimeType ?? piece.mediaType, uri: artifactUri })
    .then((outcome) => {
      if (outcome.status === "unsupported") return undefined;
      if (!outcome.path.trim()) throw new Error(EMPTY_DERIVED_PATH);
      return outcome.path;
    })
    .catch((error: unknown) => {
      throw materializationFailure(kindLabel, source.placeholder ?? artifactUri, error);
    });
}

// 块浅拷贝：媒体块的 source 再复制一层，其余块只复制壳。
function cloneContentBlock(piece: ModelMessageContentBlock): ModelMessageContentBlock {
  if (piece.type === "image" || piece.type === "video" || piece.type === "file") {
    return { ...piece, source: piece.source ? { ...piece.source } : undefined };
  }
  return { ...piece };
}

// 来源注记文案：`[Image|Video|PDF: source: <路径>]`，三类前缀固定。
function sourceAnnotation(piece: StorableMedia, path: string): string {
  const label = piece.type === "image" ? "Image" : piece.type === "video" ? "Video" : "PDF";
  return `[${label}: source: ${path}]`;
}

// 消息浅拷贝：内容整体替换，toolCalls 与 cacheControl 各复制一层。
function rebuildMessage(
  entry: ModelInputMessage,
  blocks: ModelMessageContentBlock[],
): ModelInputMessage {
  const rebuilt: ModelInputMessage = {
    ...entry,
    content: blocks,
    toolCalls: entry.toolCalls?.map((invocation) => ({ ...invocation })),
    cacheControl: entry.cacheControl ? { ...entry.cacheControl } : undefined,
  };
  return rebuilt;
}

export const projectMessagesWithMediaAttachmentPaths = async (
  history: ModelInputMessage[],
  store: ToolArtifactStorePort | undefined,
): Promise<ModelInputMessage[]> => {
  let materialized = false;

  const projectedHistory = await Promise.all(
    history.map(async (entry) => {
      if (entry.role !== "user" || !Array.isArray(entry.content)) return entry;
      const blocks = entry.content;

      // 先枚举可物化块的下标，再并发解析路径；下标对齐保证结果按输入顺序落位。
      const candidateOrdinals: number[] = [];
      blocks.forEach((piece, ordinal) => {
        if (isMaterializableSource(piece)) candidateOrdinals.push(ordinal);
      });
      if (candidateOrdinals.length === 0) return entry;

      const resolvedPaths = await Promise.all(
        candidateOrdinals.map((ordinal) =>
          materializeAttachmentPath(blocks[ordinal] as StorableMedia, store),
        ),
      );
      const pathByOrdinal = new Map<number, string>();
      candidateOrdinals.forEach((ordinal, slot) => {
        const path = resolvedPaths[slot];
        if (path) pathByOrdinal.set(ordinal, path);
      });
      if (pathByOrdinal.size === 0) return entry;

      materialized = true;
      const nextContent = blocks.map((piece, ordinal) => {
        const path = pathByOrdinal.get(ordinal);
        if (path === undefined || !isMaterializableSource(piece)) return cloneContentBlock(piece);
        return { ...piece, source: { ...piece.source!, path } };
      });
      // 注记按候选顺序追加在消息末尾，一条物化一条注记。
      for (const [ordinal, path] of pathByOrdinal) {
        nextContent.push({
          type: "text",
          text: sourceAnnotation(blocks[ordinal] as StorableMedia, path),
        });
      }
      return rebuildMessage(entry, nextContent);
    }),
  );

  return materialized ? projectedHistory : history;
};
