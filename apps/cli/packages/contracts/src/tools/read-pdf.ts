// SPDX-License-Identifier: Apache-2.0
// Read 工具的 PDF 契约：页数上限、超时与错误码，以及页码区间的解析与校验。

export const READ_PDF_NATIVE_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const READ_PDF_EXTRACT_MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const READ_PDF_NATIVE_MAX_PAGES = 10;
export const READ_PDF_MAX_PAGES_PER_REQUEST = 20;
export const READ_PDF_INFO_TIMEOUT_MS = 10_000;
export const READ_PDF_AVAILABILITY_TIMEOUT_MS = 5_000;
export const READ_PDF_RENDER_TIMEOUT_MS = 120_000;
export const READ_PDF_PAGES_DESCRIPTION =
  'Page range for PDF files (e.g., "1-5", "3", "10-20"). Only applicable to PDF files. Maximum 20 pages per request.';

export const ReadErrorCode = {
  PDF_INVALID_PAGES: 7,
  PDF_PAGE_RANGE_TOO_LARGE: 8,
  PDF_PAGES_IMAGES_UNSUPPORTED: 10,
  PDF_CONFIGURATION_ERROR: 11,
  PDF_INVALID: 12,
  PDF_TOO_LARGE: 13,
  PDF_TOO_MANY_PAGES: 14,
  PDF_TIMEOUT: 15,
  PDF_PASSWORD_PROTECTED: 16,
  PDF_PAGE_OUT_OF_RANGE: 17,
  PDF_PERMISSION_DENIED: 18,
  PDF_IO_ERROR: 19,
  PDF_PROCESS_FAILED: 20,
} as const;

export type ReadErrorCode = (typeof ReadErrorCode)[keyof typeof ReadErrorCode];

export interface ReadPdfPageRange {
  firstPage: number;
  lastPage: number;
}

export interface ReadPdfPagesValidationFailure {
  errorCode: typeof ReadErrorCode.PDF_INVALID_PAGES | typeof ReadErrorCode.PDF_PAGE_RANGE_TOO_LARGE;
  message: string;
}

// 页码区间按「首段 - 尾段」拆解：只有一段表示单页，尾段为空表示开放区间（读到最后一页）。
const PAGE_INDEX_DIGITS = /^\d+$/u;

// 「给不出区间」的统一返回值：命名常量比裸 undefined 更清楚地表达这是解析失败而非空区间。
const NO_PAGE_RANGE: undefined = undefined;

// 「不需要给模型报错」的统一返回值：校验通过时返回它。
const NO_VALIDATION_FAILURE: undefined = undefined;

// 失败结果集中构造：错误码与文案成对出现，避免调用点各写一份对象字面量。
function validationFailure(
  errorCode: ReadPdfPagesValidationFailure["errorCode"],
  message: string,
): ReadPdfPagesValidationFailure {
  return { errorCode, message } as ReadPdfPagesValidationFailure;
}

function pageNumberOrUndefined(part: string): number | undefined {
  if (!PAGE_INDEX_DIGITS.test(part)) return undefined;
  const page = Number(part);
  if (!Number.isSafeInteger(page)) return undefined;
  return page;
}

export function parseReadPdfPageRange(value: string): ReadPdfPageRange | undefined {
  const segments = value.trim().split("-");
  if (segments.length > 2) return NO_PAGE_RANGE;
  const firstPage = pageNumberOrUndefined(segments[0] ?? "");
  if (firstPage === undefined || firstPage < 1) return NO_PAGE_RANGE;
  if (segments.length === 1) return { firstPage, lastPage: firstPage };
  const tail = segments[1] ?? "";
  if (tail === "") return { firstPage, lastPage: Number.POSITIVE_INFINITY };
  const lastPage = pageNumberOrUndefined(tail);
  if (lastPage === undefined || lastPage < firstPage) return NO_PAGE_RANGE;
  return { firstPage, lastPage };
}

function readPdfPageCount(range: ReadPdfPageRange): number {
  return range.lastPage === Number.POSITIVE_INFINITY
    ? READ_PDF_MAX_PAGES_PER_REQUEST + 1
    : range.lastPage - range.firstPage + 1;
}

export function getReadPdfPagesValidationFailure(
  filePath: string,
  pages: string | undefined,
): ReadPdfPagesValidationFailure | undefined {
  // 只在 PDF 且显式给了 pages 时校验；其他情况交给 Read 的常规流程。
  const appliesToPdf = pages !== undefined && filePath.toLowerCase().endsWith(".pdf");
  if (!appliesToPdf) return NO_VALIDATION_FAILURE;

  const range = parseReadPdfPageRange(pages as string);
  if (range === undefined) {
    const invalidMessage = `Invalid pages parameter: "${pages}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.`;
    return validationFailure(ReadErrorCode.PDF_INVALID_PAGES, invalidMessage);
  }
  const requestedPageCount = readPdfPageCount(range);
  if (requestedPageCount > READ_PDF_MAX_PAGES_PER_REQUEST) {
    const tooLargeMessage = `Page range "${pages}" exceeds maximum of ${READ_PDF_MAX_PAGES_PER_REQUEST} pages per request. Please use a smaller range.`;
    return validationFailure(ReadErrorCode.PDF_PAGE_RANGE_TOO_LARGE, tooLargeMessage);
  }
  return NO_VALIDATION_FAILURE;
}
