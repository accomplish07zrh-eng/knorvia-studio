// SPDX-License-Identifier: Apache-2.0
// Read 工具的声明面：读文本/图片/PDF 的输入形状、输出形状与错误码。
// Reference: file read input / output shape

import { z } from "zod";
import { VIDEO_INPUT_MAX_BYTES } from "@knorvia/shared";
import type { ToolCallId, TraceId } from "../interfaces/shared.js";
import { toToolJsonSchema } from "./json-schema.js";
import { getReadPdfPagesValidationFailure, READ_PDF_PAGES_DESCRIPTION } from "./read-pdf.js";

export * from "./read-pdf.js";
export * from "./read-state.js";

export const READ_MAX_FILE_SIZE_BYTES = 256 * 1024;
export const READ_MAX_OUTPUT_TOKENS = 25_000;
export const READ_DEFAULT_MAX_LINES = 2_000;
export const READ_IMAGE_MAX_BASE64_BYTES = 5 * 1024 * 1024;
export const READ_IMAGE_TARGET_BYTES = Math.floor((READ_IMAGE_MAX_BASE64_BYTES * 3) / 4);
export const READ_IMAGE_MAX_DIMENSION = 2000;
export const READ_IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO = 0.125;
export const READ_VIDEO_MAX_INPUT_BYTES = VIDEO_INPUT_MAX_BYTES;

// 输入 schema：file_path 必填（绝对路径），offset/limit 可选，PDF 变体多一个 pages。

const UNSUPPORTED_BINARY_EXTENSIONS = new Set(
  ".7z .a .bin .bz2 .class .dll .dmg .dylib .exe .gz .jar .o .pyc .rar .so .tar .tgz .wasm .zip".split(
    " ",
  ),
);
const BLOCKING_DEVICE_PATHS = new Set(
  "/dev/console /dev/fd/0 /dev/fd/1 /dev/fd/2 /dev/full /dev/random /dev/stderr /dev/stdin /dev/stdout /dev/tty /dev/urandom /dev/zero".split(
    " ",
  ),
);

// 行位置与行数是同一形状的两个区间：上界与类型收成命名形状，字段行因此都能保持一行。
const lineOffsetValue = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const lineLimitValue = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
// 两条模型可见文案与合同冻结的那份逐字一致，只是抽成了常量。
const READ_OFFSET_DESCRIPTION =
  "The line number to start reading from. Only provide if the file is too large to read at once";
const READ_LIMIT_DESCRIPTION =
  "The number of lines to read. Only provide if the file is too large to read at once.";
const offsetField = lineOffsetValue.optional().describe(READ_OFFSET_DESCRIPTION);
const limitField = lineLimitValue.optional().describe(READ_LIMIT_DESCRIPTION);

// file_path 是绝对路径；三个字段的必填/可选与合同一致。
const ReadProviderInputBaseSchema = z.object({
  file_path: z.string().describe("The absolute path to the file to read"),
  offset: offsetField,
  limit: limitField,
});

const ReadProviderPdfSchema = ReadProviderInputBaseSchema.extend({
  pages: z.string().optional().describe(READ_PDF_PAGES_DESCRIPTION),
});

export const ReadInputSchema = ReadProviderPdfSchema.superRefine(checkReadInput);

export const ReadInputJsonSchema = toToolJsonSchema(ReadProviderInputBaseSchema);
export const ReadPdfInputJsonSchema = toToolJsonSchema(ReadProviderPdfSchema);

// 校验回调只关心这两个字段，单独给一个形状名，签名因此能收成一行。
interface ReadSemanticInput {
  file_path?: unknown;
  pages?: unknown;
}

// pages 校验失败时唯一的出口：把失败原因转成 zod issue。
function reportPagesFailure(failure: { message: string }, context: z.RefinementCtx): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path: ["pages"], message: failure.message });
}

// 入口校验：先看 pages 的分页表达式，再做路径检查。file_path 不是字符串时直接放行，
// 类型错误交给 zod 自己报。
function checkReadInput(input: ReadSemanticInput, context: z.RefinementCtx): void {
  const filePath = input.file_path;
  if (typeof filePath !== "string") return;
  const lowerPath = filePath.toLowerCase();

  if (typeof input.pages === "string") {
    const pagesFailure = getReadPdfPagesValidationFailure(filePath, input.pages);
    if (pagesFailure) return reportPagesFailure(pagesFailure, context);
  }

  checkReadPath(filePath, lowerPath, context);
}

// 已知二进制后缀：命中才拒，没有后缀或不在清单里都放行。
function isUnsupportedBinaryExtension(lowerPath: string): boolean {
  const extension = extensionOf(lowerPath);
  return extension !== undefined && UNSUPPORTED_BINARY_EXTENSIONS.has(extension);
}

// 路径检查：先拒会阻塞或无限输出的设备文件，再按后缀拒已知二进制格式。
function checkReadPath(filePath: string, lowerPath: string, context: z.RefinementCtx): void {
  if (BLOCKING_DEVICE_PATHS.has(lowerPath)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["file_path"],
      message: `Cannot read '${filePath}': this device file would block or produce infinite output.`,
    });
  } else if (isUnsupportedBinaryExtension(lowerPath)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["file_path"],
      message: `This tool cannot read binary files. The file appears to be a binary ${extensionOf(lowerPath)} file. Please use appropriate tools for binary file analysis.`,
    });
  }
}

export type ReadInput = z.infer<typeof ReadInputSchema>;

// 取小写路径最后一段的后缀（含点）；没有后缀、或以点开头时返回 undefined。
function extensionOf(path: string): string | undefined {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name = path.slice(lastSlash + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : undefined;
}

// 输出形状：文本、图片、视频与 PDF 各自的信封，外加统一的错误码常量。

export interface ReadTextOutput {
  type: "text";
  filePath: string;
  content: string;
  numLines: number;
  startLine: number;
  totalLines: number;
  sizeBytes?: number;
  bytesRead?: number;
  truncated?: boolean;
  truncatedByTokenCap?: boolean;
  partialViewNotice?: string;
}

export interface ReadImageOutput {
  type: "image";
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  originalSize: number;
  transformedSize?: number;
  resized?: boolean;
  compressed?: boolean;
  compressionStrategy?: string;
  dimensions?: {
    originalWidth?: number;
    originalHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
  };
}

/** Read 视频输出：不做转码/压缩，仅读取 base64 并做大小校验。 */
export interface ReadVideoOutput {
  type: "video";
  base64: string;
  mimeType:
    | "video/mp4"
    | "video/quicktime"
    | "video/webm"
    | "video/x-matroska"
    | "video/x-m4v"
    | "video/x-msvideo";
  originalSize: number;
}

export interface ReadNotebookOutput {
  type: "notebook";
  notebookPath: string;
  cells: NotebookCell[];
}

export interface NotebookCell {
  cellType: "code" | "markdown";
  source: string;
  outputs?: CellOutput[];
}

export interface CellOutput {
  type: "stream" | "execute_result" | "error" | "display_data";
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ReadPdfOutput {
  type: "pdf";
  filePath: string;
  base64: string;
  originalSize: number;
  pages?: string;
}

export interface ReadPartsOutput {
  type: "parts";
  filePath: string;
  numParts: number;
  originalSize: number;
  pages: Array<ReadImageOutput & { pageNumber: number }>;
}

export interface ReadUnchangedOutput {
  type: "file_unchanged";
  filePath: string;
}

export type ReadOutput =
  | ReadTextOutput
  | ReadImageOutput
  | ReadVideoOutput
  | ReadNotebookOutput
  | ReadPdfOutput
  | ReadPartsOutput
  | ReadUnchangedOutput;

export const ReadTextOutputSchema = z
  .object({
    type: z.literal("text"),
    filePath: z.string(),
    content: z.string(),
    numLines: z.number().int().nonnegative(),
    startLine: z.number().int().nonnegative(),
    totalLines: z.number().int().nonnegative(),
    sizeBytes: z.number().int().nonnegative().optional(),
    bytesRead: z.number().int().nonnegative().optional(),
    truncated: z.boolean().optional(),
    truncatedByTokenCap: z.boolean().optional(),
    partialViewNotice: z.string().optional(),
  })
  .strict();

export const ReadImageDimensionsSchema = z
  .object({
    originalWidth: z.number().int().nonnegative().optional(),
    originalHeight: z.number().int().nonnegative().optional(),
    displayWidth: z.number().int().nonnegative().optional(),
    displayHeight: z.number().int().nonnegative().optional(),
  })
  .strict();

export const ReadImageOutputSchema = z
  .object({
    type: z.literal("image"),
    base64: z.string(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
    originalSize: z.number().int().nonnegative(),
    transformedSize: z.number().int().nonnegative().optional(),
    resized: z.boolean().optional(),
    compressed: z.boolean().optional(),
    compressionStrategy: z.string().optional(),
    dimensions: ReadImageDimensionsSchema.optional(),
  })
  .strict();

export const ReadVideoOutputSchema = z
  .object({
    type: z.literal("video"),
    base64: z.string(),
    mimeType: z.enum([
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-matroska",
      "video/x-m4v",
      "video/x-msvideo",
    ]),
    originalSize: z.number().int().nonnegative(),
  })
  .strict();

export const ReadCellOutputSchema = z
  .object({
    type: z.enum(["stream", "execute_result", "error", "display_data"]),
    text: z.string(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const ReadNotebookCellSchema = z
  .object({
    cellType: z.enum(["code", "markdown"]),
    source: z.string(),
    outputs: z.array(ReadCellOutputSchema).optional(),
  })
  .strict();

export const ReadNotebookOutputSchema = z
  .object({
    type: z.literal("notebook"),
    notebookPath: z.string(),
    cells: z.array(ReadNotebookCellSchema),
  })
  .strict();

export const ReadPdfOutputSchema = z
  .object({
    type: z.literal("pdf"),
    filePath: z.string(),
    base64: z.string(),
    originalSize: z.number().int().nonnegative(),
    pages: z.string().optional(),
  })
  .strict();

export const ReadPartsOutputSchema = z
  .object({
    type: z.literal("parts"),
    filePath: z.string(),
    numParts: z.number().int().nonnegative(),
    originalSize: z.number().int().nonnegative(),
    pages: z.array(ReadImageOutputSchema.extend({ pageNumber: z.number().int().positive() })),
  })
  .strict();

export const ReadUnchangedOutputSchema = z
  .object({
    type: z.literal("file_unchanged"),
    filePath: z.string(),
  })
  .strict();

export const ReadOutputSchema = z.union([
  ReadTextOutputSchema,
  ReadImageOutputSchema,
  ReadVideoOutputSchema,
  ReadNotebookOutputSchema,
  ReadPdfOutputSchema,
  ReadPartsOutputSchema,
  ReadUnchangedOutputSchema,
]);

export const ReadOutputJsonSchema = toToolJsonSchema(ReadOutputSchema);

// 一次工具调用的记录形状与结果形状（trace 归属与耗时都在这里）。

export interface ReadToolCall {
  id: ToolCallId;
  name: "Read";
  input: ReadInput;
  traceId: TraceId;
  startedAt: Date;
}

export interface ReadToolResult {
  toolCallId: ToolCallId;
  output: ReadOutput;
  traceId: TraceId;
  durationMs: number;
}
