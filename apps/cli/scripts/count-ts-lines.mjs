#!/usr/bin/env node
// 统计仓库里 TypeScript 源码的长度：逐文件行数与字节数，外加总计。
//
// 行为依据 specs/contracts/apps-cli-01/behavior.md 的 B4–B14。要点是三件事：
//   1. 哪些文件算源码 —— 由扩展名与测试文件判据共同决定（B5/B6）；
//   2. 怎么遍历 —— 字典序、跳过符号链接与固定的忽略目录（B7/B8）；
//   3. 行怎么数 —— CRLF 归一到 LF，再去掉**一个**结尾换行（B4）。
//
// 结构上按「判据 → 遍历 → 度量 → 渲染」分段，每段都是纯函数或只读 IO，
// 这样单条规则可以独立核对，不必读完整条流水线。
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 计入统计的扩展名。`.mts`/`.cts`/`.js` 等一律不算。 */
const SOURCE_EXTENSIONS = ["ts", "tsx"];
/** 目录名命中即整棵跳过：测试目录与构建/安装产物目录。 */
const SKIPPED_DIRECTORY_NAMES = ["__tests__", "node_modules", "tests"];
const BUILD_OUTPUT_DIRECTORIES = [".next", ".turbo", "build", "coverage", "dist", "out"];
/** 版本库元数据目录，不参与统计。 */
const VCS_DIRECTORY = ".git";
/** 测试文件的文件名后缀，区分大小写。 */
const TEST_FILE_SUFFIXES = [".spec.ts", ".spec.tsx", ".test.ts", ".test.tsx"];
/** Windows 与 POSIX 的分隔符都要认。 */
const SEPARATOR_RUN = /[\\/]+/gu;
const REPORT_TITLE = "TypeScript file lengths (.ts, .tsx)";
const HEADER_LABELS = ["Lines", "Bytes", "File"];
const COLUMN_GAP = "  ";

/** 目录名集合：整棵跳过（含 VCS 与构建产物）。 */
const SKIP_DIRECTORIES = new Set([
  VCS_DIRECTORY,
  ...SKIPPED_DIRECTORY_NAMES,
  ...BUILD_OUTPUT_DIRECTORIES,
]);

/** 统一的展示路径：分隔符一律折成 `/`，与平台无关。 */
const toDisplayPath = (path) => path.split(SEPARATOR_RUN).join("/");

/** 文件名：展示路径的最后一段。 */
const fileNameOf = (displayPath) => displayPath.slice(displayPath.lastIndexOf("/") + 1);

/**
 * 普通字符串比较。
 * 这里刻意不用 localeCompare —— 报告顺序必须与运行环境的语言设置无关（B7）。
 */
const byText = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

/** 路径的目录段（不含文件名）。 */
const directorySegmentsOf = (displayPath) => displayPath.split("/").slice(0, -1);

/** 判据：路径含测试目录段，或文件名以测试后缀结尾。 */
export function isTestSourceFile(filePath) {
  const displayPath = toDisplayPath(filePath);
  const directoryHit = directorySegmentsOf(displayPath).some((segment) =>
    SKIPPED_DIRECTORY_NAMES.includes(segment),
  );
  if (directoryHit) return true;
  const fileName = fileNameOf(displayPath);
  return TEST_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

/**
 * 判据：扩展名在统计范围内，且不是测试文件。
 * `extname` 已带前导点，比较时去掉。
 */
export function isCountedSourceFile(filePath) {
  const extension = extname(filePath).replace(/^\./u, "");
  return SOURCE_EXTENSIONS.includes(extension) && !isTestSourceFile(filePath);
}

/**
 * 行数口径：CRLF 先归一到 LF；空串为 0；随后去掉**一个**结尾换行，
 * 再按换行分段计数。因此 `"\n"` 与 `"a\n"` 都是 1 行，`"\n\n"` 是 2 行。
 */
export function countLines(source) {
  if (source.length === 0) return 0;
  const unified = source.split("\r\n").join("\n");
  const withoutTrailingBreak = unified.endsWith("\n") ? unified.slice(0, -1) : unified;
  return withoutTrailingBreak.length === 0 ? 1 : withoutTrailingBreak.split("\n").length;
}

/** 一个目录项要不要继续深入：普通目录、且名不在跳过集合里。 */
const isDescendableDirectory = (entry) => entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name);

/**
 * 递归收集源码文件。
 * 顺序：同层按名称字典序，深度优先；符号链接（文件与目录）都不收集、不进入（B8）。
 */
export async function collectTypeScriptFiles(rootDirectory) {
  const root = resolve(rootDirectory);
  const collected = [];

  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => byText(left.name, right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = join(directory, entry.name);
      if (isDescendableDirectory(entry)) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = toDisplayPath(relative(root, absolutePath));
      if (isCountedSourceFile(relativePath)) collected.push({ absolutePath, relativePath });
    }
  };

  await visit(root);
  return collected.sort((left, right) => byText(left.relativePath, right.relativePath));
}

/** 在收集结果上补 `{bytes, lines}`；并发读取但按输入顺序返回（B9）。 */
export async function measureTypeScriptFiles(rootDirectory) {
  const files = await collectTypeScriptFiles(rootDirectory);
  return Promise.all(
    files.map(async ({ absolutePath, relativePath }) => {
      const bytes = await readFile(absolutePath);
      return {
        absolutePath,
        relativePath,
        bytes: bytes.byteLength,
        lines: countLines(bytes.toString("utf8")),
      };
    }),
  );
}

/** 列宽：取表头与所有取值的最大字符数。 */
const widthOf = (label, values) =>
  Math.max(label.length, ...values.map((value) => String(value).length));

/** 一行数据：数字右对齐，路径左对齐。 */
const formatRow = (lines, bytes, path, [lineWidth, byteWidth]) =>
  [String(lines).padStart(lineWidth), String(bytes).padStart(byteWidth), path].join(COLUMN_GAP);

/**
 * 渲染报告（B10）：先按行数降序、再按路径升序；固定头部三行 + 空行 + 表头 + 数据行，
 * 整体以**一个**换行结尾。空输入也输出头部与表头，合计为 0。
 */
export function formatReport(measurements) {
  const ordered = [...measurements].sort(
    (left, right) => right.lines - left.lines || byText(left.relativePath, right.relativePath),
  );
  const totals = ordered.reduce(
    (sum, file) => ({ bytes: sum.bytes + file.bytes, lines: sum.lines + file.lines }),
    { bytes: 0, lines: 0 },
  );
  const lineWidth = widthOf(
    HEADER_LABELS[0],
    ordered.map((file) => file.lines),
  );
  const byteWidth = widthOf(
    HEADER_LABELS[1],
    ordered.map((file) => file.bytes),
  );
  const widths = [lineWidth, byteWidth];
  const headline = [
    REPORT_TITLE,
    `Files: ${ordered.length}`,
    `Total lines: ${totals.lines}`,
    `Total bytes: ${totals.bytes}`,
  ];
  const header = [
    HEADER_LABELS[0].padStart(lineWidth),
    HEADER_LABELS[1].padStart(byteWidth),
    HEADER_LABELS[2],
  ].join(COLUMN_GAP);
  const rows = ordered.map((file) => formatRow(file.lines, file.bytes, file.relativePath, widths));
  return [...headline, "", header, ...rows].join("\n") + "\n";
}

/** 扫描根：给了参数就用参数，否则用 cwd；多余参数忽略（B11/B12）。 */
const resolveScanRoot = (argv) => {
  const [first] = argv;
  return first ? resolve(first) : process.cwd();
};

/** 失败语义（B13）：stdout 保持空，stderr 一行前缀 + 底层原因，退出码 1。 */
const reportFailure = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`lint:count failed: ${message}\n`);
  process.exitCode = 1;
};

const main = async () => {
  const measurements = await measureTypeScriptFiles(resolveScanRoot(process.argv.slice(2)));
  process.stdout.write(formatReport(measurements));
};

/**
 * 入口守卫（B14）：仅当本文件被 `node` 直接执行时跑主流程。
 * 被 `import` 时模块只导出纯函数，不扫描、不输出。
 */
const isDirectInvocation = () =>
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation()) main().catch(reportFailure);
