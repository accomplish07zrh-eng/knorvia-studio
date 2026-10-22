// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// FileSystem Port —— 文件 I/O 的边界契约
// ════════════════════════════════════════════════════════════
// 工具层与核心逻辑不直接碰 node:fs，一切读写都从这里的形状进出：本文件只描述请求、结果与失败形态，
// 原子写入、并发控制、临时文件、权限归一化、跨平台差异都由实现侧承担。

// 所有权：所有 path 字段都是归一化后的绝对路径，相对路径由工具层在进入端口前解析完；端口错误由实现
// 侧抛出，调用方只按错误码分流。

// 章节：一 失败语汇 · 二 节点与元数据 · 三 读取面 · 四 写入面 · 五 目录与检索 · 六 端口本体

import type { ExecutionContext, TraceContext } from "../tracing/tracer.js";

// ── 一、失败语汇：失败了怎么表达 ─────────────────────────────────────

/** 端口失败的原因分类：调用方按码分流即可，不要拿 message 文本做判断。 */
export type FileSystemErrorCode =
  | "not_found"
  | "permission_denied"
  | "is_directory"
  | "not_file"
  | "too_large"
  | "stale_write"
  | "invalid_path"
  | "invalid_pattern"
  | "unsupported"
  | "cancelled"
  | "io_error";

/** 构造端口错误所需的原始素材：path 只在定位到具体文件的场合才填，cause 用来留住底层系统错误。 */
export interface FileSystemErrorDetails {
  code: FileSystemErrorCode;
  path?: string;
  message: string;
  cause?: unknown;
}

/** 端口错误的统一载体，由实现侧抛出。除 message 外还带稳定错误码，好让调用方不必解析文本； 判别请用 isFileSystemPortError。 */
export class FileSystemPortError extends Error {
  readonly code: FileSystemErrorCode;
  readonly path?: string;
  override readonly cause?: unknown;

  constructor(details: FileSystemErrorDetails) {
    super(details.message);
    this.name = "FileSystemPortError";
    this.code = details.code;
    this.path = details.path;
    this.cause = details.cause;
  }
}

/** 判别谓词查表用的构造器形状，仅在本文件内使用。 */
type FileSystemPortErrorConstructor = new (details: FileSystemErrorDetails) => FileSystemPortError;

/** 端口错误的类型表：判别只沿原型链比对表里的构造器，不嗅探 code 或 message 字段，否则形状相近的 普通对象也会被误认成端口错误。 */
const FILE_SYSTEM_PORT_ERROR_TYPES: readonly FileSystemPortErrorConstructor[] = [
  FileSystemPortError,
];

/** 按给定素材构造一个端口错误。 */
export function createFileSystemError(details: FileSystemErrorDetails): FileSystemPortError {
  return new FileSystemPortError(details);
}

/** 判断某个抛出物是否来自本端口。 */
export function isFileSystemPortError(error: unknown): error is FileSystemPortError {
  return FILE_SYSTEM_PORT_ERROR_TYPES.some((ctor) => error instanceof ctor);
}

// ── 二、节点与元数据：文件在边界上长什么样 ───────────────────────────

/** 路径指向的东西是哪一类；missing 表示当前不存在。 */
export type FileSystemNodeKind = "file" | "directory" | "symlink" | "other" | "missing";

/** 一次读写的版本凭据，用于并发写入防护与「内容有没有变」的比对：字段由实现侧填充，id 是其中必须 可用的那一项。 */
export interface FileSystemRevision {
  id: string;
  mtimeMs?: number;
  sizeBytes?: number;
  hash?: string;
}

/** 文本读写时以哪种换行风格为主。 */
export type FileSystemLineEndings = "LF" | "CRLF";

/** 文本编码：Node 支持的集合之外，额外认这几种中文场景常用的编码。 */
export type FileSystemTextEncoding = BufferEncoding | "gb2312" | "gbk" | "gb18030";

/** 查询单个路径的元数据；路径须为归一化绝对路径，相对路径在工具层就解析掉。 */
export interface FileSystemStatRequest {
  /** 归一化绝对路径。相对路径由工具层负责解析。 */
  path: string;
  trace?: TraceContext;
}

/** 元数据查询结果；kind 为 missing 时表示路径不存在。 */
export interface FileSystemStatResult {
  path: string;
  kind: FileSystemNodeKind;
  sizeBytes: number;
  mtimeMs?: number;
  revision?: FileSystemRevision;
}

// ── 三、读取面：整文件文本、行区间文本、原始字节 ─────────────────────

/** 读一个文件的全部文本。 */
export interface FileSystemReadTextRequest {
  /** 归一化绝对路径。相对路径由工具层负责解析。 */
  path: string;
  encoding?: FileSystemTextEncoding;
  maxBytes?: number;
  trace?: TraceContext;
}

/** 整文件文本读取的读数。 */
export interface FileSystemReadTextResult {
  path: string;
  /** 交给工具与核心逻辑的正文，换行已统一成 LF；文件原本以哪种换行为主，记在 lineEndings 里。 */
  content: string;
  encoding: FileSystemTextEncoding;
  /** 归一化成 LF 之前观测到的主要换行风格。 */
  lineEndings?: FileSystemLineEndings;
  bytesRead: number;
  sizeBytes: number;
  truncated: boolean;
  revision?: FileSystemRevision;
}

/** 按行区间读取文本。 */
export interface FileSystemReadTextRangeRequest {
  /** 归一化绝对路径。相对路径由工具层负责解析。 */
  path: string;
  encoding?: FileSystemTextEncoding;
  /** 从第几行开始（以 0 计）；工具面用的是 1 计行号，进端口前已换算过。 */
  offsetLine?: number;
  /** 取多少行；留空表示从 offsetLine 一直取到文件末尾。 */
  limitLines?: number;
  /** 文件体积护栏：越线直接以 too_large 失败，不做截断。 */
  maxBytes?: number;
  trace?: TraceContext;
}

/** 行区间读取的读数。 */
export interface FileSystemReadTextRangeResult {
  path: string;
  /** 交出去的这一段正文，换行同样统一成 LF；文件原本以哪种换行为主，记在 lineEndings 里。 */
  content: string;
  encoding: FileSystemTextEncoding;
  /** 归一化成 LF 之前观测到的主要换行风格。 */
  lineEndings?: FileSystemLineEndings;
  /** 适配器为了产出这一段实际消费掉的字节数。 */
  bytesRead: number;
  /** 文件总字节数。 */
  sizeBytes: number;
  /** 只有会主动截断区间读的适配器才为真；Node 适配器遇到越界区间会直接失败。 */
  truncated: boolean;
  /** 返回内容里第一行的行号（以 1 计）。 */
  startLine: number;
  /** content 里实际包含的行数。 */
  lineCount: number;
  /** 文件按逻辑行统计的总行数。 */
  totalLines: number;
  revision?: FileSystemRevision;
}

/** 读取原始字节，不做编码解释。 */
export interface FileSystemReadBytesRequest {
  /** 归一化绝对路径。相对路径由工具层负责解析。 */
  path: string;
  /** 文件体积护栏：越线以 too_large 失败，而不是截断内容。 */
  maxBytes?: number;
  trace?: TraceContext;
}

/** 字节读取的读数。 */
export interface FileSystemReadBytesResult {
  path: string;
  content: Uint8Array;
  bytesRead: number;
  sizeBytes: number;
  revision?: FileSystemRevision;
}

// ── 四、写入面：改内容与删文件 ───────────────────────────────────────

/** 写入文本。 */
export interface FileSystemWriteTextRequest {
  /** 归一化绝对路径。相对路径由工具层负责解析。 */
  path: string;
  content: string;
  encoding?: FileSystemTextEncoding;
  /** 落盘时把 LF 正文还原成指定的换行风格。 */
  lineEndings?: FileSystemLineEndings;
  createParents?: boolean;
  atomic?: boolean;
  /** 期望的旧版本；带上它即表示要求实现做乐观并发校验。 */
  expectedRevision?: FileSystemRevision;
  trace?: TraceContext;
}

/** 文本写入的读数。 */
export interface FileSystemWriteTextResult {
  path: string;
  bytesWritten: number;
  revision?: FileSystemRevision;
}

/** 删除一个文件。 */
export interface FileSystemRemoveFileRequest {
  /** 归一化绝对路径。相对路径由工具层负责解析。 */
  path: string;
  /** 为真时，文件本来就不存在也算删除成功。 */
  missingOk?: boolean;
  trace?: TraceContext;
}

/** 删除结果；removed 说明这次调用是否真的删掉了东西。 */
export interface FileSystemRemoveFileResult {
  path: string;
  removed: boolean;
}

// ── 五、目录与检索：建目录、列目录、找文件、找内容 ───────────────────

/** 创建目录。 */
export interface FileSystemCreateDirectoryRequest {
  /** 归一化绝对路径。父目录会被递归创建。 */
  path: string;
  trace?: TraceContext;
}

/** 建目录结果。 */
export interface FileSystemCreateDirectoryResult {
  path: string;
}

/** 列出一个目录的即时子项。 */
export interface FileSystemListDirectoryRequest {
  /** 归一化绝对目录路径。相对路径由调用方解析。 */
  path: string;
  trace?: TraceContext;
}

/** 目录里的一个条目。 */
export interface FileSystemListDirectoryEntry {
  kind: FileSystemNodeKind;
  name: string;
  path: string;
}

/** 列目录的读数。 */
export interface FileSystemListDirectoryResult {
  durationMs: number;
  entries: FileSystemListDirectoryEntry[];
  numEntries: number;
  path: string;
}

/** 按文件名模式查找文件。 */
export interface FileSystemSearchFilesRequest {
  /** 归一化绝对目录路径。相对路径由工具层负责解析。 */
  path: string;
  /** 相对 path 生效的 glob 模式；适配器若支持别的写法，需自行在文档中说明。 */
  pattern: string;
  maxResults?: number;
  offset?: number;
  trace?: TraceContext;
}

/** 文件名检索的读数。 */
export interface FileSystemSearchFilesResult {
  path: string;
  pattern: string;
  durationMs: number;
  files: string[];
  numFiles: number;
  truncated: boolean;
}

/** 内容检索要哪种产出形态：带上下文的内容、仅命中文件名、还是每文件计数。 */
export type FileSystemTextSearchOutputMode = "content" | "files_with_matches" | "count";

/** 按内容检索文本。 */
export interface FileSystemSearchTextRequest {
  /** 归一化绝对路径，可以是文件也可以是目录。相对路径由工具层负责解析。 */
  path: string;
  pattern: string;
  glob?: string;
  outputMode?: FileSystemTextSearchOutputMode;
  beforeContext?: number;
  afterContext?: number;
  context?: number;
  showLineNumbers?: boolean;
  onlyMatching?: boolean;
  ignoreCase?: boolean;
  type?: string;
  headLimit?: number;
  offset?: number;
  multiline?: boolean;
  trace?: TraceContext;
}

/** 内容检索返回的一条记录：字段随产出形态变化——内容形态给出行号与文本，计数形态给出 count， 命中文件名形态只用 path。 */
export interface FileSystemSearchTextEntry {
  path: string;
  lineNumber?: number;
  text?: string;
  count?: number;
  matched?: boolean;
}

/** 内容检索的读数，包含实际生效的分页参数。 */
export interface FileSystemSearchTextResult {
  path: string;
  pattern: string;
  mode: FileSystemTextSearchOutputMode;
  durationMs: number;
  files: string[];
  entries: FileSystemSearchTextEntry[];
  numMatches: number;
  truncated: boolean;
  appliedLimit?: number;
  appliedOffset?: number;
}

// ── 六、端口本体：调用选项与唯一入口 ─────────────────────────────────

/** 调用侧的运行时开关，不进入文件语义本身。 */
export interface FileSystemOperationOptions {
  signal?: AbortSignal;
  context?: ExecutionContext;
}

/** 文件系统端口的完整能力面：每个方法接收一份请求与可选的调用选项、返回 Promise，实现负责把平台 差异、权限问题与临时文件处理干净，只把结果或 FileSystemPortError 交给调用方。 */
export interface FileSystemPort {
  createDirectory(
    request: FileSystemCreateDirectoryRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemCreateDirectoryResult>;
  stat(
    request: FileSystemStatRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemStatResult>;
  readTextFile(
    request: FileSystemReadTextRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemReadTextResult>;
  readBinaryFile(
    request: FileSystemReadBytesRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemReadBytesResult>;
  readTextFileRange(
    request: FileSystemReadTextRangeRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemReadTextRangeResult>;
  writeTextFile(
    request: FileSystemWriteTextRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemWriteTextResult>;
  removeFile(
    request: FileSystemRemoveFileRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemRemoveFileResult>;
  listDirectory(
    request: FileSystemListDirectoryRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemListDirectoryResult>;
  searchFiles(
    request: FileSystemSearchFilesRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemSearchFilesResult>;
  searchText(
    request: FileSystemSearchTextRequest,
    options?: FileSystemOperationOptions,
  ): Promise<FileSystemSearchTextResult>;
}
