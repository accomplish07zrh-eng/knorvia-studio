// SPDX-License-Identifier: Apache-2.0
// ripgrep 参数计划：把搜索请求翻译成 argv，并给出 sandbox 需要的 root 与 preopens。
import { basename, dirname } from "node:path";
import type { FileSystemSearchTextRequest } from "@knorvia/contracts";
import { fileType, TYPE_EXTENSIONS, VCS_NAMES } from "./file-search-paths.js";

/** 固定前缀：禁用用户配置、允许隐藏文件、单行输出、限制单列宽度。 */
const BASE_FLAGS: readonly string[] = [
  "--no-config",
  "--hidden",
  "--color",
  "never",
  "--no-heading",
  "--with-filename",
  "--max-columns",
  "500",
];

const SANDBOX_ROOT = ".";

/** 每个 VCS 目录都要显式排除自身与其内容（ripgrep 默认忽略规则不可依赖）。 */
function appendVcsExclusions(argv: string[]): void {
  for (const vcs of VCS_NAMES) {
    argv.push("--glob", "!" + vcs, "--glob", `!**/${vcs}/**`);
  }
}

/** glob 允许空格分隔多个模式；`{a,b}` 视为一个整体，其余按逗号再拆。 */
function appendGlobPatterns(argv: string[], glob: string): void {
  for (const chunk of glob.split(/\s+/u)) {
    const braceGroup = chunk.includes("{") && chunk.includes("}");
    const parts = braceGroup ? [chunk] : chunk.split(",");
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0) argv.push("--glob", trimmed);
    }
  }
}

/** 类型过滤展开成「精确扩展名 + 递归扩展名」两条 glob；非法类型名直接忽略。 */
function appendTypeFilters(argv: string[], type: string): void {
  const resolved = fileType(type);
  if (!/^[a-z0-9_+-]+$/iu.test(resolved)) return;
  for (const extension of TYPE_EXTENSIONS[resolved] ?? ["." + resolved]) {
    argv.push("--glob", "*" + extension, "--glob", "**/*" + extension);
  }
}

/** 内容模式：JSON 输出 + 可选 only-matching/上下文；否则只统计行数。 */
function appendOutputMode(argv: string[], request: FileSystemSearchTextRequest): void {
  if (request.outputMode !== "content") {
    argv.push("-c");
    return;
  }
  argv.push("--json");
  if (request.onlyMatching) argv.push("--only-matching");
  if (request.context !== undefined) {
    argv.push("-C", String(request.context));
    return;
  }
  if (request.beforeContext !== undefined) argv.push("-B", String(request.beforeContext));
  if (request.afterContext !== undefined) argv.push("-A", String(request.afterContext));
}

export function searchPlan(request: FileSystemSearchTextRequest, directory: boolean) {
  const root = directory ? request.path : dirname(request.path);
  const argv = [...BASE_FLAGS];
  appendVcsExclusions(argv);
  if (request.multiline) argv.push("-U", "--multiline-dotall");
  if (request.ignoreCase) argv.push("-i");
  appendOutputMode(argv, request);
  if (request.glob) appendGlobPatterns(argv, request.glob);
  if (request.type) appendTypeFilters(argv, request.type);
  argv.push("-e", request.pattern.trim(), "--", directory ? SANDBOX_ROOT : basename(request.path));

  const plan = {} as { args: string[]; preopens: Record<string, string>; root: string };
  plan.args = argv;
  plan.preopens = { [SANDBOX_ROOT]: root };
  plan.root = root;
  return plan;
}
