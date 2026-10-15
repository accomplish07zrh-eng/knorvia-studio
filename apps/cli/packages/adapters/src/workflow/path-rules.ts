// SPDX-License-Identifier: Apache-2.0
// 工作流路径与命名规则：固定文件名、相对路径越界判定、id 合法性与取消检查。
import { isAbsolute, normalize } from "node:path";

/** runs 目录下的固定文件名；换布局时只改这一处。 */
export const WORKFLOW_FILES = {
  events: "events.jsonl",
  graph: "graph.jsonl",
  index: "index.json",
  report: "report.md",
  run: "run.json",
} as const;

export type WorkflowFileName = keyof typeof WORKFLOW_FILES;

const PARENT_REFERENCE = /(?:^|[/\\])\.\.(?:[/\\]|$)/u;
const ID_PATTERN = /^[a-zA-Z0-9._-]+$/u;
const RESERVED_IDS: ReadonlySet<string> = new Set([".", ".."]);

/** 取消检查：优先透传 `signal.reason`，否则用调用方给的兜底文案。 */
export function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error(message);
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** 产物路径必须落在 run 目录内：拒绝绝对路径与任何 `..` 片段。 */
export function normalizeRelativePath(value: string): string {
  const normalized = normalize(value);
  const escapes = isAbsolute(normalized) || PARENT_REFERENCE.test(normalized);
  if (escapes) {
    const text = `Workflow artifact path must stay inside the run directory: ${value}`;
    throw new Error(text);
  }
  return normalized;
}

/** runId 进目录名之前的净化：非安全字符替换为下划线，限长 120。 */
export function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
}

function isFileSafeId(value: string): boolean {
  if (value.length === 0 || RESERVED_IDS.has(value)) return false;
  if (value.includes("/") || value.includes("\\")) return false;
  return normalize(value) === value && ID_PATTERN.test(value);
}

export function validateDefinitionId(value: string): void {
  if (isFileSafeId(value)) return;
  throw new Error(`Workflow definition id must be a file-safe name: ${value}`);
}
