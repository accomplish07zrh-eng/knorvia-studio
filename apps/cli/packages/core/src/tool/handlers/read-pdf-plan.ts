// PDF request admission; specs/knorvia-read-pdf-projection.md.
// Repository transition licence and source review obligations remain applicable.
import {
  READ_PDF_EXTRACT_MAX_INPUT_BYTES,
  READ_PDF_MAX_PAGES_PER_REQUEST,
  READ_PDF_NATIVE_MAX_INPUT_BYTES,
  ReadErrorCode,
  parseReadPdfPageRange,
} from "@knorvia/contracts";
import type { ToolHandlerFailure } from "../types.js";

export type PdfReadPlan =
  | { kind: "native" }
  | { kind: "pages"; firstPage: number; lastPage: number }
  | { kind: "rejected"; failure: ToolHandlerFailure };

export const pdfFailure = (errorCode: ReadErrorCode, message: string): ToolHandlerFailure => ({
  result: false,
  errorCode,
  message,
});

const SIZE_UNITS = [
  { ceiling: 1024, divisor: 1, suffix: " bytes" },
  { ceiling: 1024 ** 2, divisor: 1024, suffix: "KB" },
  { ceiling: 1024 ** 3, divisor: 1024 ** 2, suffix: "MB" },
  { ceiling: Infinity, divisor: 1024 ** 3, suffix: "GB" },
] as const;

export function pdfSizeLabel(bytes: number): string {
  // NaN 和 Infinity 与旧边界相同落到 GB；bytes 档保留原始数值字符串。
  const unit = SIZE_UNITS.find((candidate) => bytes < candidate.ceiling) ?? SIZE_UNITS[3];
  const value =
    unit.divisor === 1 ? String(bytes) : (bytes / unit.divisor).toFixed(1).replace(/\.0$/u, "");
  return value + unit.suffix;
}

export function planPdfRead(sizeBytes: number, pages: string | undefined): PdfReadPlan {
  const reject = (code: ReadErrorCode, message: string): PdfReadPlan => ({
    kind: "rejected",
    failure: pdfFailure(code, message),
  });
  const native = pages === undefined;
  const limit = native ? READ_PDF_NATIVE_MAX_INPUT_BYTES : READ_PDF_EXTRACT_MAX_INPUT_BYTES;
  if (sizeBytes > limit) {
    return reject(
      ReadErrorCode.PDF_TOO_LARGE,
      native
        ? `PDF file exceeds maximum allowed size of ${pdfSizeLabel(limit)}.`
        : `PDF file exceeds maximum allowed size for text extraction (${pdfSizeLabel(limit)}).`,
    );
  }
  if (native) return { kind: "native" };
  const range = parseReadPdfPageRange(pages);
  if (!range)
    return reject(
      ReadErrorCode.PDF_INVALID,
      `Invalid pages parameter: "${pages}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.`,
    );
  if (
    range.lastPage === Infinity ||
    range.lastPage - range.firstPage + 1 > READ_PDF_MAX_PAGES_PER_REQUEST
  )
    return reject(
      ReadErrorCode.PDF_INVALID,
      `Page range "${pages}" exceeds maximum of ${READ_PDF_MAX_PAGES_PER_REQUEST} pages per request. Please use a smaller range.`,
    );
  return { kind: "pages", ...range };
}
