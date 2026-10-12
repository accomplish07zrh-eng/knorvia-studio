// SPDX-License-Identifier: Apache-2.0
// PDF 适配：用 poppler 的 pdfinfo/pdftoppm 读取页数并渲染页面图片。
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PdfDocumentPortError,
  READ_PDF_AVAILABILITY_TIMEOUT_MS,
  READ_PDF_INFO_TIMEOUT_MS,
  READ_PDF_MAX_PAGES_PER_REQUEST,
  READ_PDF_RENDER_TIMEOUT_MS,
} from "@knorvia/contracts";
import type {
  ExecutionPort,
  ExecutionResult,
  PdfDocumentPageCountRequest,
  PdfDocumentPort,
  PdfDocumentRenderedPage,
  PdfDocumentRenderPagesRequest,
} from "@knorvia/contracts";

export interface PopplerPdfDocumentAdapterOptions {
  executionPort: ExecutionPort;
  tempRoot?: string;
}

/** poppler 输出里的固定文案与本地命名：按字母序声明，便于比对与替换。 */
const imageMediaType = "image/jpeg" as const;
const imagePrefix = "page";
const temporaryDirectoryPrefix = "knorvia-read-pdf-";
const extractionCancelled = "PDF page extraction was cancelled.";
const unavailableMessage =
  "pdftoppm is not installed. Install poppler-utils (e.g. `brew install poppler` or `apt-get install poppler-utils`) to enable PDF page rendering.";
/** pdftoppm 固定参数：100dpi JPEG。 */
const RENDER_FLAGS = ["-jpeg", "-r", "100"] as const;

const PASSWORD_PATTERN = /password/iu;
const RANGE_PATTERN = /Wrong page range given[\s\S]*last page \((\d+)\)/iu;
const CORRUPT_PATTERN = /damaged|corrupt|invalid/iu;
const SYNTAX_PATTERN =
  /Syntax Error(?: \(\d+\))?: Couldn't (?:find trailer dictionary|read xref table)/iu;
const COMMAND_ERROR_PATTERN = /^(?:Command Line Error|Internal Error)(?: \(\d+\))?: /u;
const PAGE_COUNT_PATTERN = /^Pages:\s+(\d+)\s*$/imu;
const PAGE_IMAGE_PATTERN = /-(\d+)\.jpg$/iu;

/** 渲染流程的结果：成功带页面，失败带原因，交给清理阶段决定抛出时机。 */
type ExtractionOutcome =
  | { ok: true; rendered: PdfDocumentRenderedPage[] }
  | { ok: false; failure: unknown };

interface PageEntry {
  name: string;
  pageNumber: number;
}

/** 一次 pdf 工具调用的统一入参。 */
interface ToolCall {
  args: string[];
  executionPort: ExecutionPort;
  file: string;
  cancellation: AbortSignal | undefined;
  timeoutMs: number;
  trace: PdfDocumentRenderPagesRequest["trace"];
}

/** 诊断分类的输入：diagnostics 原文与派生的首行/拼接详情。 */
interface DiagnosticContext {
  blob: string;
  head: string;
  rows: string[];
  request: PdfDocumentRenderPagesRequest;
  outcome: ExecutionResult;
  diagnostics: string;
}

type DiagnosticStep = (context: DiagnosticContext) => PdfDocumentPortError | undefined;

function filesystemFailure(
  text: string,
  cancellation: AbortSignal | undefined,
  reason: unknown,
): PdfDocumentPortError {
  return cancellation?.aborted
    ? pdfFailure("cancelled", extractionCancelled, reason)
    : pdfFailure("io_error", text, reason);
}

/** 统一的 PDF 失败构造：third 参数为 cause 时可省略包装对象。 */
function pdfFailure(
  code: ConstructorParameters<typeof PdfDocumentPortError>[0],
  text: string,
  cause?: unknown,
): PdfDocumentPortError {
  return cause === undefined
    ? new PdfDocumentPortError(code, text)
    : new PdfDocumentPortError(code, text, { cause });
}
/** 统一的执行入口：调用方只说「哪个命令、什么参数、多久超时」。 */
async function runTool(call: ToolCall): Promise<ExecutionResult> {
  const command = { mode: "argv" as const, file: call.file, args: call.args };
  const options = call.cancellation ? { signal: call.cancellation } : undefined;
  return await call.executionPort.run(
    { command, timeoutMs: call.timeoutMs, trace: call.trace },
    options,
  );
}

function timedOut(outcome: ExecutionResult): boolean {
  return outcome.timedOut || outcome.status === "timed_out";
}

function diagnosticDetail(outcome: ExecutionResult): string {
  return [outcome.stderr.text, outcome.stdout.text, outcome.error?.message]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();
}

/** 页码越界提示：把请求区间与文档实际页数一起给出。 */
function pageRangeFailure(
  request: PdfDocumentRenderPagesRequest,
  count: number,
): PdfDocumentPortError {
  const requested =
    request.firstPage === request.lastPage
      ? `page ${request.firstPage}`
      : `pages ${request.firstPage}-${request.lastPage}`;
  const plural = count === 1 ? "" : "s";
  const limit = Math.min(count, READ_PDF_MAX_PAGES_PER_REQUEST);
  const text = `Requested ${requested} is outside the document (PDF has ${count} page${plural}). Use a range within 1-${count}, maximum ${READ_PDF_MAX_PAGES_PER_REQUEST} pages per request (e.g. pages: "1-${limit}").`;
  return pdfFailure("page_out_of_range", text);
}

const passwordFailure: DiagnosticStep = ({ diagnostics }) =>
  PASSWORD_PATTERN.test(diagnostics)
    ? pdfFailure(
        "password_protected",
        "PDF is password-protected. Please provide an unprotected version.",
      )
    : undefined;

/** 页区间越界：0 页视为损坏，正数页数给出可用的请求区间。 */
const rangeFailure: DiagnosticStep = ({ request, diagnostics }) => {
  const diagnostic = RANGE_PATTERN.exec(diagnostics);
  if (diagnostic === null) return undefined;
  const count = Number(diagnostic[1]);
  if (count === 0) {
    return pdfFailure(
      "corrupted",
      "PDF reports 0 pages (empty page tree). The PDF may be invalid.",
    );
  }
  if (!Number.isSafeInteger(count) || count < 1) return undefined;
  return pageRangeFailure(request, count);
};

/** 首行 I/O 与权限错误：只在没有命令行诊断行时采用。 */
const firstLineFailure: DiagnosticStep = ({ head, rows, request }) => {
  if (rows.some((line) => COMMAND_ERROR_PATTERN.test(line))) return undefined;
  if (head.startsWith("I/O Error: ") && head.includes(`'${request.filePath}'`)) {
    return pdfFailure("io_error", `Could not render PDF: ${head}`);
  }
  if (head.startsWith("Permission Error: ")) {
    return pdfFailure("permission_denied", `Could not render PDF: ${head}`);
  }
  return undefined;
};

const corruptedFailure: DiagnosticStep = ({ diagnostics }) =>
  CORRUPT_PATTERN.test(diagnostics) || SYNTAX_PATTERN.test(diagnostics)
    ? pdfFailure("corrupted", "PDF file is corrupted or invalid.")
    : undefined;

/** 分类顺序即优先级：密码 → 页区间 → 首行 I/O/权限 → 损坏；都不匹配则进程失败。 */
const DIAGNOSTIC_STEPS: readonly DiagnosticStep[] = [
  passwordFailure,
  rangeFailure,
  firstLineFailure,
  corruptedFailure,
];

function inspectRenderOutcome(
  outcome: ExecutionResult,
  request: PdfDocumentRenderPagesRequest,
): void {
  if (outcome.cancelled) {
    throw pdfFailure("cancelled", extractionCancelled);
  }
  if (timedOut(outcome)) {
    throw pdfFailure(
      "timeout",
      `PDF page extraction timed out after ${READ_PDF_RENDER_TIMEOUT_MS}ms.`,
    );
  }
  if (outcome.status === "completed" && outcome.exitCode === 0) return;

  const diagnostics = outcome.stderr.text;
  const rows = diagnostics.split("\n");
  const context: DiagnosticContext = {
    blob: diagnosticDetail(outcome),
    head: rows[0] ?? "",
    rows,
    request,
    outcome,
    diagnostics,
  };
  for (const step of DIAGNOSTIC_STEPS) {
    const failure = step(context);
    if (failure !== undefined) throw failure;
  }
  const text = context.blob.length > 0 ? `pdftoppm failed: ${context.blob}` : "pdftoppm failed.";
  throw pdfFailure("process_failed", text, outcome.error?.cause);
}

/** 从文件名解析页序号：形如 `prefix-12.jpg`，非页面文件忽略。 */
function pageEntries(entries: string[]): PageEntry[] {
  const pages: PageEntry[] = [];
  for (const name of entries) {
    const match = PAGE_IMAGE_PATTERN.exec(name);
    if (match === null) continue;
    const pageNumber = Number(match[1]);
    if (Number.isSafeInteger(pageNumber) && pageNumber >= 1) pages.push({ name, pageNumber });
  }
  return pages.sort((left, right) => left.pageNumber - right.pageNumber);
}

async function collectPages(
  tempDir: string,
  cancellation: AbortSignal | undefined,
): Promise<PdfDocumentRenderedPage[]> {
  let entries: string[];
  try {
    entries = await readdir(tempDir);
  } catch (reason) {
    throw filesystemFailure("Unable to list rendered PDF page images.", cancellation, reason);
  }

  const pageList = pageEntries(entries);
  if (pageList.length === 0) {
    throw pdfFailure("corrupted", "pdftoppm produced no output pages. The PDF may be invalid.");
  }

  try {
    const reads = pageList.map(async (entry): Promise<PdfDocumentRenderedPage> => {
      const location = join(tempDir, entry.name);
      const options = cancellation === undefined ? undefined : { signal: cancellation };
      return {
        data: new Uint8Array(await readFile(location, options)),
        mediaType: imageMediaType,
        pageNumber: entry.pageNumber,
      };
    });
    return await Promise.all(reads);
  } catch (reason) {
    throw filesystemFailure("Unable to read rendered PDF page images.", cancellation, reason);
  }
}

/** pdftoppm 渲染参数：固定 flags + 请求区间 + 输入文件 + 输出前缀。 */
function renderArgs(request: PdfDocumentRenderPagesRequest, outputPrefix: string): string[] {
  return [
    ...RENDER_FLAGS,
    "-f",
    String(request.firstPage),
    "-l",
    String(request.lastPage),
    request.filePath,
    outputPrefix,
  ];
}

function toolCall(
  executionPort: ExecutionPort,
  file: string,
  args: string[],
  timeoutMs: number,
  trace: PdfDocumentRenderPagesRequest["trace"],
  cancellation: AbortSignal | undefined,
): ToolCall {
  return { args, executionPort, file, cancellation, timeoutMs, trace };
}

/** pdfinfo 输出解析：`Pages: N`；缺失或非法返回 undefined（调用方视为未知页数）。 */
function parsePageCount(text: string): number | undefined {
  const match = PAGE_COUNT_PATTERN.exec(text);
  const count = Number(match?.[1]);
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

export function createPopplerPdfDocumentAdapter(
  options: PopplerPdfDocumentAdapterOptions,
): PdfDocumentPort {
  let toolAvailable = false;

  async function checkAvailability(
    request: PdfDocumentRenderPagesRequest,
    cancellation: AbortSignal | undefined,
  ): Promise<void> {
    if (toolAvailable) return;
    const call = toolCall(
      options.executionPort,
      "pdftoppm",
      ["-v"],
      READ_PDF_AVAILABILITY_TIMEOUT_MS,
      request.trace,
      cancellation,
    );
    const outcome = await runTool(call);
    if (outcome.cancelled || cancellation?.aborted) {
      throw pdfFailure("cancelled", extractionCancelled);
    }
    if (timedOut(outcome)) {
      throw pdfFailure(
        "timeout",
        `PDF page extraction availability check timed out after ${READ_PDF_AVAILABILITY_TIMEOUT_MS}ms.`,
      );
    }
    const completed = outcome.status === "completed" || outcome.status === "failed";
    const usableExit =
      outcome.exitCode === 0 ||
      (outcome.exitCode !== undefined &&
        outcome.exitCode !== 127 &&
        outcome.stderr.text.length > 0);
    if (!completed || !usableExit) {
      throw pdfFailure("unavailable", unavailableMessage, outcome.error?.cause);
    }
    toolAvailable = true;
  }

  return {
    async getPageCount(
      request: PdfDocumentPageCountRequest,
      callOptions?: { cancellation?: AbortSignal },
    ): Promise<number | undefined> {
      const cancellation = callOptions?.cancellation;
      const call = toolCall(
        options.executionPort,
        "pdfinfo",
        [request.filePath],
        READ_PDF_INFO_TIMEOUT_MS,
        request.trace,
        cancellation,
      );
      const outcome = await runTool(call);
      if (outcome.cancelled || cancellation?.aborted) {
        throw pdfFailure("cancelled", "PDF inspection was cancelled.");
      }
      if (outcome.status !== "completed" || outcome.exitCode !== 0) return undefined;
      return parsePageCount(outcome.stdout.text);
    },

    async renderPages(
      request: PdfDocumentRenderPagesRequest,
      callOptions?: { cancellation?: AbortSignal },
    ): Promise<PdfDocumentRenderedPage[]> {
      const cancellation = callOptions?.cancellation;
      await checkAvailability(request, cancellation);

      let tempDir: string;
      try {
        tempDir = await mkdtemp(join(options.tempRoot ?? tmpdir(), temporaryDirectoryPrefix));
      } catch (reason) {
        throw filesystemFailure(
          "Unable to create a temporary directory for PDF page extraction.",
          cancellation,
          reason,
        );
      }

      let attempt: ExtractionOutcome;
      try {
        const call = toolCall(
          options.executionPort,
          "pdftoppm",
          renderArgs(request, join(tempDir, imagePrefix)),
          READ_PDF_RENDER_TIMEOUT_MS,
          request.trace,
          cancellation,
        );
        inspectRenderOutcome(await runTool(call), request);
        attempt = { ok: true, rendered: await collectPages(tempDir, cancellation) };
      } catch (reason) {
        attempt = { ok: false, failure: reason };
      }

      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (reason) {
        if (attempt.ok) {
          throw filesystemFailure(
            "Unable to remove temporary PDF page images.",
            cancellation,
            reason,
          );
        }
      }
      if (!attempt.ok) throw attempt.failure;
      return attempt.rendered;
    },
  };
}
