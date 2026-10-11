// SPDX-License-Identifier: Apache-2.0
// M0-8 相似度门槛：文本规范化与仓库路径校验。
import { extname } from "node:path";

export const LINE_CONTAINMENT_LIMIT = 0.2;
export const LINE_RUN_LIMIT = 8;
export const LINE_MIN_LINES = 10;
// M0-8 校准值：439 个已登记 independent-replacement 文件的结构相似度最大值向上取到 0.05 的整数倍；
// 超过 0.4 的历史文件按计划书列入替换队列。校准见 docs/knorvia-similarity-calibration-20261011.md。
export const STRUCTURAL_LIMIT = 0.4;
export const STRUCTURAL_KGRAM = 25;
export const STRUCTURAL_WINDOW = 20;

const JS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const DRIVE_PREFIX = /^[a-z]:/i;
const SEGMENT_SEPARATORS = /^[{}\[\]();,]+$/;
const PATH_LIMIT = 1024;

// 每个谓词返回一个「不合格」的说明；全部为 null 才接受。
function relativePathProblem(path) {
  if (typeof path !== "string") return "not a string";
  if (path.length === 0) return "empty";
  if (path.length > PATH_LIMIT) return "too long";
  if (path.includes("\\")) return "backslash separator";
  if (path.includes("\0")) return "NUL byte";
  if (DRIVE_PREFIX.test(path)) return "absolute drive path";
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".."))
    return "empty, dot or dot-dot segment";
  return null;
}

export function assertRelativePath(path) {
  const problem = relativePathProblem(path);
  if (problem)
    throw new Error(`Invalid repository-relative path (${problem}): ${JSON.stringify(path)}`);
  return path;
}

// 无效 UTF-8 与含 NUL 的内容按二进制跳过，判定与来源清单的指纹逻辑一致。
export function decodeText(bytes) {
  if (bytes.includes(0)) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let text = null;
  try {
    text = decoder.decode(bytes);
  } catch {
    return null;
  }
  return text.replace(/\r\n/g, "\n");
}

function isImportOrReexport(line) {
  return (
    line.startsWith("import ") || line.startsWith("export * from") || line.startsWith("export {")
  );
}

export function normalizeLines(text, options = {}) {
  const compatNames = options.compatNames ?? [];
  const kept = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0 || SEGMENT_SEPARATORS.test(line)) continue;
    if (isImportOrReexport(line)) continue;
    // 纯声明文件按 interface.md 列出的名字剔除兼容行，再进入两道门槛。
    if (compatNames.some((name) => line.includes(name))) continue;
    kept.push(line);
  }
  return kept;
}

export function kindOf(path) {
  const extension = extname(path).toLowerCase();
  if (JS_EXTENSIONS.includes(extension)) return "js-family";
  return extension || "(none)";
}
