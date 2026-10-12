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

const extractionCancelled = "PDF page extraction was cancelled.";
const unavailableMessage =
  "pdftoppm is not installed. Install poppler-utils (e.g. `brew install poppler` or `apt-get install poppler-utils`) to enable PDF page rendering.";
const temporaryDirectoryPrefix = "knorvia-read-pdf-";
const imagePrefix = "page";
const imageMediaType = "image/jpeg" as const;

/** 渲染流程的结果：成功带页面，失败带原因，交由清理阶段统一决定抛出时机。 */
type ExtractionOutcome =
  | { succeeded: true; pages: PdfDocumentRenderedPage[] }
  | { succeeded: false; cause: unknown };

interface PageEntry {
  name: string;
  pageNumber: number;
}

/** 一次 pdf 工具调用的统一入参。 */
interface ToolCall {
  args: string[];
  executionPort: ExecutionPort;
  file: string;
  signal: AbortSignal | undefined;
  timeoutMs: number;
  trace: PdfDocumentRenderPagesRequest["trace"];
}

function filesystemFailure(
  message: string,
  signal: AbortSignal | undefined,
  cause: unknown,
): PdfDocumentPortError {
  return signal?.aborted
    ? new PdfDocumentPortError("cancelled", extractionCancelled, { cause })
    : new PdfDocumentPortError("io_error", message, { cause });
}

/** 统一的执行入口：调用方只说「哪个命令、什么参数、多久超时」。 */
async function runTool(call: ToolCall): Promise<ExecutionResult> {
  const command = { mode: "argv" as const, file: call.file, args: call.args };
  const options = call.signal ? { signal: call.signal } : undefined;
  return await call.executionPort.run(
    { command, timeoutMs: call.timeoutMs, trace: call.trace },
    options,
  );
}

function timedOut(result: ExecutionResult): boolean {
  return result.timedOut || result.status === "timed_out";
}

function diagnosticDetail(result: ExecutionResult): string {
  return [result.stderr.text, result.stdout.text, result.error?.message]
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
  const message = `Requested ${requested} is outside the document (PDF has ${count} page${plural}). Use a range within 1-${count}, maximum ${READ_PDF_MAX_PAGES_PER_REQUEST} pages per request (e.g. pages: "1-${limit}").`;
  return new PdfDocumentPortError("page_out_of_range", message);
}

/** 首行 I/O 与权限错误：只在没有命令行诊断行时采用。 */
function firstLineFailure(firstLine: string, filePath: string): PdfDocumentPortError | undefined {
  if (firstLine.startsWith("I/O Error: ") && firstLine.includes(`'${filePath}'`)) {
    return new PdfDocumentPortError("io_error", `Could not render PDF: ${firstLine}`);
  }
  if (firstLine.startsWith("Permission Error: ")) {
    return new PdfDocumentPortError("permission_denied", `Could not render PDF: ${firstLine}`);
  }
  return undefined;
}

function inspectRenderOutcome(
  result: ExecutionResult,
  request: PdfDocumentRenderPagesRequest,
): void {
  if (result.cancelled) {
    throw new PdfDocumentPortError("cancelled", extractionCancelled);
  }
  if (timedOut(result)) {
    throw new PdfDocumentPortError(
      "timeout",
      `PDF page extraction timed out after ${READ_PDF_RENDER_TIMEOUT_MS}ms.`,
    );
  }
  if (result.status === "completed" && result.exitCode === 0) return;

  const stderr = result.stderr.text;
  const detail = diagnosticDetail(result);

  if (/password/iu.test(stderr)) {
    throw new PdfDocumentPortError(
      "password_protected",
      "PDF is password-protected. Please provide an unprotected version.",
    );
  }

  const rangeDiagnostic = /Wrong page range given[\s\S]*last page \((\d+)\)/iu.exec(stderr);
  if (rangeDiagnostic) {
    const count = Number(rangeDiagnostic[1]);
    if (count === 0) {
      throw new PdfDocumentPortError(
        "corrupted",
        "PDF reports 0 pages (empty page tree). The PDF may be invalid.",
      );
    }
    if (Number.isSafeInteger(count) && count >= 1) throw pageRangeFailure(request, count);
  }

  const lines = stderr.split("\n");
  const firstLine = lines[0] ?? "";
  const commandDiagnostic = lines.some((line) =>
    /^(?:Command Line Error|Internal Error)(?: \(\d+\))?: /u.test(line),
  );
  if (!commandDiagnostic) {
    const early = firstLineFailure(firstLine, request.filePath);
    if (early !== undefined) throw early;
  }
  if (
    /damaged|corrupt|invalid/iu.test(stderr) ||
    /Syntax Error(?: \(\d+\))?: Couldn't (?:find trailer dictionary|read xref table)/iu.test(stderr)
  ) {
    throw new PdfDocumentPortError("corrupted", "PDF file is corrupted or invalid.");
  }
  const message = detail.length > 0 ? `pdftoppm failed: ${detail}` : "pdftoppm failed.";
  throw new PdfDocumentPortError("process_failed", message, { cause: result.error?.cause });
}

/** 从文件名解析页序号：形如 `prefix-12.jpg`，非页面文件忽略。 */
function pageEntries(names: string[]): PageEntry[] {
  const pages: PageEntry[] = [];
  for (const name of names) {
    const match = /-(\d+)\.jpg$/iu.exec(name);
    if (match === null) continue;
    const pageNumber = Number(match[1]);
    if (Number.isSafeInteger(pageNumber) && pageNumber >= 1) pages.push({ name, pageNumber });
  }
  return pages.sort((left, right) => left.pageNumber - right.pageNumber);
}

async function collectPages(
  workDir: string,
  signal: AbortSignal | undefined,
): Promise<PdfDocumentRenderedPage[]> {
  let names: string[];
  try {
    names = await readdir(workDir);
  } catch (cause) {
    throw filesystemFailure("Unable to list rendered PDF page images.", signal, cause);
  }

  const pages = pageEntries(names);
  if (pages.length === 0) {
    throw new PdfDocumentPortError(
      "corrupted",
      "pdftoppm produced no output pages. The PDF may be invalid.",
    );
  }

  try {
    const reads = pages.map(async (entry): Promise<PdfDocumentRenderedPage> => {
      const location = join(workDir, entry.name);
      const options = signal === undefined ? undefined : { signal };
      return {
        data: new Uint8Array(await readFile(location, options)),
        mediaType: imageMediaType,
        pageNumber: entry.pageNumber,
      };
    });
    return await Promise.all(reads);
  } catch (cause) {
    throw filesystemFailure("Unable to read rendered PDF page images.", signal, cause);
  }
}

/** pdftoppm 固定参数：100dpi JPEG。 */
const RENDER_FLAGS = ["-jpeg", "-r", "100"] as const;

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

export function createPopplerPdfDocumentAdapter(
  options: PopplerPdfDocumentAdapterOptions,
): PdfDocumentPort {
  let toolAvailable = false;

  async function checkAvailability(
    request: PdfDocumentRenderPagesRequest,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    if (toolAvailable) return;
    const result = await runTool({
      args: ["-v"],
      executionPort: options.executionPort,
      file: "pdftoppm",
      signal,
      timeoutMs: READ_PDF_AVAILABILITY_TIMEOUT_MS,
      trace: request.trace,
    });
    if (result.cancelled || signal?.aborted) {
      throw new PdfDocumentPortError("cancelled", extractionCancelled);
    }
    if (timedOut(result)) {
      throw new PdfDocumentPortError(
        "timeout",
        `PDF page extraction availability check timed out after ${READ_PDF_AVAILABILITY_TIMEOUT_MS}ms.`,
      );
    }
    const completed = result.status === "completed" || result.status === "failed";
    const usableExit =
      result.exitCode === 0 ||
      (result.exitCode !== undefined && result.exitCode !== 127 && result.stderr.text.length > 0);
    if (!completed || !usableExit) {
      throw new PdfDocumentPortError("unavailable", unavailableMessage, {
        cause: result.error?.cause,
      });
    }
    toolAvailable = true;
  }

  return {
    async getPageCount(
      request: PdfDocumentPageCountRequest,
      callOptions?: { signal?: AbortSignal },
    ): Promise<number | undefined> {
      const result = await runTool({
        args: [request.filePath],
        executionPort: options.executionPort,
        file: "pdfinfo",
        signal: callOptions?.signal,
        timeoutMs: READ_PDF_INFO_TIMEOUT_MS,
        trace: request.trace,
      });
      if (result.cancelled || callOptions?.signal?.aborted) {
        throw new PdfDocumentPortError("cancelled", "PDF inspection was cancelled.");
      }
      if (result.status !== "completed" || result.exitCode !== 0) return undefined;
      const match = /^Pages:\s+(\d+)\s*$/imu.exec(result.stdout.text);
      const count = Number(match?.[1]);
      return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
    },

    async renderPages(
      request: PdfDocumentRenderPagesRequest,
      callOptions?: { signal?: AbortSignal },
    ): Promise<PdfDocumentRenderedPage[]> {
      const signal = callOptions?.signal;
      await checkAvailability(request, signal);

      let workDir: string;
      try {
        workDir = await mkdtemp(join(options.tempRoot ?? tmpdir(), temporaryDirectoryPrefix));
      } catch (cause) {
        throw filesystemFailure(
          "Unable to create a temporary directory for PDF page extraction.",
          signal,
          cause,
        );
      }

      let outcome: ExtractionOutcome;
      try {
        const result = await runTool({
          args: renderArgs(request, join(workDir, imagePrefix)),
          executionPort: options.executionPort,
          file: "pdftoppm",
          signal,
          timeoutMs: READ_PDF_RENDER_TIMEOUT_MS,
          trace: request.trace,
        });
        inspectRenderOutcome(result, request);
        outcome = { succeeded: true, pages: await collectPages(workDir, signal) };
      } catch (cause) {
        outcome = { succeeded: false, cause };
      }

      try {
        await rm(workDir, { recursive: true, force: true });
      } catch (cause) {
        if (outcome.succeeded) {
          throw filesystemFailure("Unable to remove temporary PDF page images.", signal, cause);
        }
      }
      if (!outcome.succeeded) throw outcome.cause;
      return outcome.pages;
    },
  };
}
