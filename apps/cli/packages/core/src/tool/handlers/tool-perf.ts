// SPDX-License-Identifier: Apache-2.0
// 工具执行性能助手：命令分类、安全身份折叠、命令哈希、耗时取整、字节计数与
// 遥测对象的读取/合并/挂载。分类与哈希都做有界处理——超大 heredoc/内联脚本
// 不为埋点复制或解析全文，隐私边界只放行公开命令表内的静态可执行名。
import { createHash } from "node:crypto";
import type { CommandExecutionTelemetry, ToolExecutionTelemetry } from "@knorvia/contracts";
import type { ToolExecutionContext } from "../types.js";
import { analyzeBashCommand } from "./bash-command-parser.js";
import { BASH_COMMAND_REGISTRY } from "./generated/bash-command-registry.js";

const HASH_DIGEST_CHARS = 16;
const HASH_EDGE_CHARS = 4096;
const CLASSIFY_SCAN_CHARS = 2048;
const IDENTITY_PARSE_CHARS = 8 * 1024;
const FALLBACK_IDENTITY_NAME = "other";
const COMPOUND_IDENTITY_NAME = "compound";
const EMPTY_IDENTITY_NAME = "empty";

// 遥测分类只看有界前缀；顺序即优先级——测试/包管理先于宽泛的 git 与搜索。
const CATEGORY_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:npm|pnpm|yarn|bun)\s+(?:test|run\s+test|vitest|jest)\b/u, "test"],
  [/\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|update|remove)\b/u, "package"],
  [/\bgit\b/u, "git"],
  [/\b(?:rg|grep|find|fd)\b/u, "search"],
  [/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|compile)\b/u, "build"],
  [/\b(?:curl|wget|gh\s+api)\b/u, "network"],
];

export function roundNonNegativeMs(duration: number): number {
  if (!Number.isFinite(duration)) return 0;
  return Math.max(0, Math.round(duration));
}

export function elapsedMsSince(startedAt: number): number {
  return roundNonNegativeMs(Date.now() - startedAt);
}

export function commandHash(cmd: string): string {
  const digest = createHash("sha256");
  digest.update(String(cmd.length));
  digest.update("\0");
  digest.update(cmd.slice(0, HASH_EDGE_CHARS));
  if (cmd.length > HASH_EDGE_CHARS) {
    digest.update("\0");
    digest.update(cmd.slice(-HASH_EDGE_CHARS));
  }
  return digest.digest("hex").slice(0, HASH_DIGEST_CHARS);
}

export function classifyCommand(cmd: string): string {
  // Bugfix: Bash command 可能包含超大 heredoc/inline script，遥测分类只看有界前缀，
  // 避免为了埋点复制并扫描完整命令，也避免正文里的 "npm test" 误导命令分类。
  const bounded = cmd.slice(0, CLASSIFY_SCAN_CHARS).trimStart().toLowerCase();
  if (!bounded) return EMPTY_IDENTITY_NAME;
  for (const [pattern, label] of CATEGORY_PATTERNS) {
    if (pattern.test(bounded)) return label;
  }
  return FALLBACK_IDENTITY_NAME;
}

export function classifySafeCommandIdentity(
  cmd: string,
): Pick<CommandExecutionTelemetry, "count" | "name"> {
  // 类别和 hash 已经有界，但安全命令名仍会把完整 heredoc/inline script
  // 交给 parser。遥测不能为超大命令额外制造 O(n) CPU/内存；此时宁可少一个 count。
  if (cmd.length > IDENTITY_PARSE_CHARS) {
    return { name: FALLBACK_IDENTITY_NAME };
  }
  const parsed = analyzeBashCommand(cmd);
  const segmentCount = parsed.commands.length;
  if (!cmd.trim()) return { count: 0, name: EMPTY_IDENTITY_NAME };
  if (parsed.hasParseErrors || parsed.hasUnsupportedSyntax || parsed.hasDynamicWords) {
    return { count: segmentCount, name: FALLBACK_IDENTITY_NAME };
  }
  if (segmentCount !== 1) {
    return {
      count: segmentCount,
      name: segmentCount > 1 ? COMPOUND_IDENTITY_NAME : FALLBACK_IDENTITY_NAME,
    };
  }
  const executable = lastPathWord(parsed.commands[0]?.name ?? "").toLowerCase();
  const knownExecutable = Object.hasOwn(BASH_COMMAND_REGISTRY, executable);
  // 隐私边界：只允许公开命令表中的静态可执行文件名进入远端 Trace；
  // 自定义脚本名和无法判定的动态表达式统一降级，绝不上传原始 token。
  return { count: segmentCount, name: knownExecutable ? executable : FALLBACK_IDENTITY_NAME };
}

export function workspaceKind(ctx: ToolExecutionContext): "local" | "remote" | "unknown" {
  const detachedScope = ctx.runtimeScope === "subagent";
  return detachedScope ? "unknown" : "local";
}

export function fileByteCount(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

export function readToolExecutionTelemetry(view: unknown): ToolExecutionTelemetry | undefined {
  if (view === null || typeof view !== "object" || Array.isArray(view)) return undefined;
  const attached = (view as { perf?: unknown }).perf;
  if (attached === null || typeof attached !== "object" || Array.isArray(attached))
    return undefined;
  return compactToolExecutionTelemetry(attached as ToolExecutionTelemetry);
}

export function compactToolExecutionTelemetry(
  perf: ToolExecutionTelemetry,
): ToolExecutionTelemetry | undefined {
  const kept: Record<string, unknown> = {};
  if (perf.totalMs !== undefined) kept.totalMs = perf.totalMs;
  if (perf.permissionWaitMs !== undefined) kept.permissionWaitMs = perf.permissionWaitMs;
  if (perf.detail) kept.detail = perf.detail;
  return Object.keys(kept).length > 0 ? (kept as ToolExecutionTelemetry) : undefined;
}

export function mergeToolExecutionTelemetry(
  ...items: (ToolExecutionTelemetry | undefined)[]
): ToolExecutionTelemetry | undefined {
  return compactToolExecutionTelemetry(Object.assign({}, ...items));
}

export function attachToolExecutionTelemetry<T extends object>(
  view: T,
  perf: ToolExecutionTelemetry | undefined,
): T {
  if (!perf) return view;
  Object.defineProperty(view, "perf", {
    configurable: true,
    enumerable: false,
    value: perf,
    writable: true,
  });
  return view;
}

function lastPathWord(pathish: string): string {
  return pathish.split(/[\\/]/u).at(-1) ?? "";
}
