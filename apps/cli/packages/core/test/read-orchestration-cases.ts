// Owned synthetic scenarios; retained contract prose/output is not an originality claim.
export interface ReadScenario {
  label: string;
  input?: unknown;
  suffix?: string;
  repeats?: number;
  stat?: any;
  range?: any;
  cache?: any;
  fallback?: boolean;
  noMetadata?: boolean;
  noFileSystem?: boolean;
  noImage?: boolean;
  noPdf?: boolean;
  pdf?: unknown;
  image?: unknown;
  cwd?: unknown;
  workspace?: unknown;
  fault?: { target: string; kind: string; code?: string };
}
export const normalStat = {
  kind: "file",
  sizeBytes: 15,
  mtimeMs: 90.9,
  revision: { id: "synthetic-stat-revision", mtimeMs: 90.9 },
};
export const normalRange = {
  content: "synthetic\nlines",
  encoding: "utf8",
  sizeBytes: 15,
  bytesRead: 15,
  truncated: false,
  startLine: 1,
  lineCount: 2,
  totalLines: 2,
  revision: { id: "synthetic-range-revision", mtimeMs: 80.8 },
};
export const cacheEntry = {
  content: "cached synthetic",
  isPartialView: false,
  mtimeMs: 90.1,
  sizeBytes: 15,
  revisionId: "synthetic-cached-revision",
};
export const directCases: ReadScenario[] = [
  { label: "text" },
  { label: "same window repeats", repeats: 3 },
  { label: "fallback repeats", fallback: true, repeats: 3 },
  { label: "no metadata", noMetadata: true },
  { label: "missing filesystem", noFileSystem: true },
  ...[
    null,
    [],
    {},
    { file_path: 7 },
    { file_path: "" },
    { file_path: "x", offset: -1 },
    { file_path: "x", limit: 0 },
    { file_path: "x", limit: 1.1 },
    { file_path: "/dev/zero" },
    { file_path: "blocked.ZIP" },
    { file_path: "x.txt", pages: "1" },
    { file_path: "x.pdf", pages: "0" },
    { file_path: "x.pdf", pages: "1-21" },
  ].map((input, index) => ({ label: `invalid/${index}`, input, noFileSystem: true })),
  ...[0, 1, 2, Number.MAX_SAFE_INTEGER].flatMap((offset) =>
    [undefined, 1, 2].map((limit) => ({
      label: `window/${offset}/${limit}`,
      input: { file_path: "synthetic.txt", offset, limit },
    })),
  ),
  { label: "schema strips extra", input: { file_path: "synthetic.txt", fictional: true } },
  { label: "sibling resolution", input: { file_path: "../synthetic-sibling.txt" } },
  { label: "cwd not absolute", cwd: "relative" },
  { label: "workspace not absolute", workspace: "relative" },
  { label: "cwd wrong type", cwd: 7 },
  ...["PNG", "jpeg", "gif", "WEBP", "mp4", "MOV", "webm", "mkv"].map((suffix) => ({
    label: `media/${suffix}`,
    suffix,
  })),
  { label: "missing image processor", suffix: "png", noImage: true },
  { label: "empty video", suffix: "mp4", range: { bytesRead: 0 } },
  { label: "PDF native", suffix: "PDF", pdf: true },
  { label: "PDF rendered", input: { file_path: "synthetic.pdf", pages: "1-2" }, pdf: true },
  {
    label: "PDF no image support",
    input: { file_path: "synthetic.pdf", pages: "1" },
    pdf: true,
    image: false,
  },
  { label: "PDF missing document port", suffix: "pdf", pdf: true, noPdf: true },
  { label: "PDF false text route", suffix: "pdf", pdf: false },
  { label: "PDF truthy nonboolean text route", suffix: "pdf", pdf: "yes" },
  { label: "directory stat delegated", stat: { kind: "directory" } },
  { label: "empty text", range: { content: "", lineCount: 0, totalLines: 0 } },
  {
    label: "out of range",
    input: { file_path: "synthetic.txt", offset: 4 },
    range: { content: "", lineCount: 0, startLine: 4 },
  },
  { label: "adapter truncation", range: { truncated: true } },
  {
    label: "first-line token partial",
    range: { content: "x".repeat(100001), lineCount: 1, totalLines: 1 },
  },
  {
    label: "explicit window token rejection",
    input: { file_path: "synthetic.txt", limit: 1 },
    range: { content: "x".repeat(100001) },
  },
  { label: "range revision fallback", stat: { revision: undefined, mtimeMs: undefined } },
  {
    label: "no revision means no metadata",
    stat: { revision: undefined },
    range: { revision: undefined },
  },
  { label: "fresh cache", cache: cacheEntry },
  { label: "partial cache re-read", cache: { ...cacheEntry, isPartialView: true } },
  { label: "mtime mismatch", cache: { ...cacheEntry, mtimeMs: 89 } },
  { label: "size mismatch", cache: { ...cacheEntry, sizeBytes: 14 } },
  {
    label: "revision ID cache match",
    stat: { revision: { id: "same" }, mtimeMs: undefined },
    cache: { ...cacheEntry, mtimeMs: undefined, revisionId: "same" },
  },
  {
    label: "size-only cache match",
    stat: { revision: undefined, mtimeMs: undefined },
    cache: { ...cacheEntry, mtimeMs: undefined, revisionId: undefined },
  },
  { label: "malformed cache", cache: 7 },
  { label: "null stat", stat: null },
  { label: "null range", range: null },
  ...[
    "stat",
    "readTextFileRange",
    "readBinaryFile",
    "prepareForModel",
    "getPageCount",
    "renderPages",
    "state.get",
    "state.set",
    "metadata",
  ].flatMap((target) =>
    ["throw", "reject", "value", "nonfunction"].map((kind) => ({
      label: `fault/${target}/${kind}`,
      fault: { target, kind },
      ...(target === "readBinaryFile" || target === "prepareForModel" ? { suffix: "png" } : {}),
      ...(target === "getPageCount" ? { suffix: "pdf", pdf: true } : {}),
      ...(target === "renderPages"
        ? { input: { file_path: "synthetic.pdf", pages: "1" }, pdf: true }
        : {}),
    })),
  ),
  ...[
    "not_found",
    "too_large",
    "permission_denied",
    "cancelled",
    "io_error",
    "is_directory",
  ].flatMap((code) =>
    ["stat", "readTextFileRange", "readBinaryFile"].map((target) => ({
      label: `filesystem/${target}/${code}`,
      fault: { target, kind: "filesystem", code },
      ...(target === "readBinaryFile" ? { suffix: "png" } : {}),
    })),
  ),
];
export const contextFields = [
  "fileSystemPort",
  "workingDirectory",
  "workspaceRoot",
  "traceContext",
  "traceId",
  "spanId",
  "parentSpanId",
  "sessionId",
  "turnId",
  "abortSignal",
  "readFileState",
  "recordReadFileStateMetadata",
  "model",
  "imageProcessorPort",
  "pdfDocumentPort",
];
export const getterCases = ["text", "cached", "image", "video", "pdf"].flatMap((route) => [
  { route, target: "", at: 0 },
  ...contextFields.flatMap((field) =>
    [1, 2].map((at) => ({ route, target: `context.${field}`, at })),
  ),
  ...[
    "stat",
    "readTextFileRange",
    "readBinaryFile",
    "prepareForModel",
    "getPageCount",
    "state.get",
    "state.set",
    "stat.revision",
    "cache.isPartialView",
  ].map((target) => ({ route, target, at: 1 })),
]);
export const executorCases: ReadScenario[] = directCases.filter((c) =>
  [
    "text",
    "same window repeats",
    "missing filesystem",
    "schema strips extra",
    "sibling resolution",
    "media/PNG",
    "media/mp4",
    "PDF native",
    "PDF rendered",
    "PDF false text route",
    "PDF no image support",
    "empty text",
    "out of range",
    "adapter truncation",
    "first-line token partial",
    "explicit window token rejection",
    "range revision fallback",
    "no revision means no metadata",
    "fresh cache",
    "partial cache re-read",
    "fault/stat/nonfunction",
    "fault/readTextFileRange/reject",
    "fault/metadata/throw",
    "filesystem/stat/not_found",
    "filesystem/readTextFileRange/too_large",
    "filesystem/stat/cancelled",
    "invalid/0",
    "invalid/8",
    "invalid/10",
    "invalid/11",
    "invalid/12",
  ].includes(c.label),
);
