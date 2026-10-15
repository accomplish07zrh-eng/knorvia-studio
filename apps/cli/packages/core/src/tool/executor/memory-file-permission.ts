// SPDX-License-Identifier: Apache-2.0
// memory 目录下 Markdown 文件的写权限：把「模式拒绝」这一条覆盖成允许，其余判定保持不动。
//
// 覆盖范围很窄，只有同时满足三条才生效：目标是 memory 根内的 .md、路径解析成功、且原判定是
// 可覆盖的那一类（计划模式的非只读拒绝）。任何工具自报的 alwaysAsk、项目规则 ask、hook ask
// 都保持原样——放行它们会让「任何情况都要问」静默消失。

import type { PermissionDecisionResult } from "../../permission/service.js";
import {
  resolveContainedMemoryFilePath,
  resolveSafeMemoryFilePath,
} from "../../memory/memory-file-path.js";

const WRITE_TOOL_NAME = "Write";
const EDIT_TOOL_NAME = "Edit";
const ALLOW_OVERRIDE = { allowed: true, decision: "allow", escalated: false } as const;

/** 未知形状的输入。 */
type UnknownInput = unknown;

const MARKDOWN_SUFFIX = ".md";
const ALLOW_REASON = "Memory Markdown writes are allowed";
const ALLOW_RULE_ID = "memory.file.markdown";

/** 可以被本模块覆盖的拒绝规则（目前只有计划模式的非只读拒绝）。 */
const OVERRIDABLE_DENY_RULES: ReadonlySet<string> = new Set(["mode.plan.nonReadOnly"]);
/** 必须保留的 ask 规则。 */
const PRESERVED_ASK_RULES: ReadonlySet<string> = new Set([
  "rule.project.ask",
  "hook.PreToolUse.ask",
]);

interface MemoryWriteRequest {
  readonly executionInput: unknown;
  readonly memoryRoot?: string;
  readonly toolName: string;
  readonly workingDirectory: string;
  readonly workspaceRoot: string;
}

interface MemoryWritePermissionRequest extends MemoryWriteRequest {
  readonly decision: PermissionDecisionResult;
}

export function applyMemoryFilePermission(
  input: MemoryWritePermissionRequest,
): PermissionDecisionResult {
  const { decision, memoryRoot, workingDirectory, workspaceRoot } = input;
  const requested = resolveMemoryFileTarget(input);
  if (requested === undefined || memoryRoot === undefined) return decision;

  const contained = resolveSafeMemoryFilePath({
    filePath: requested,
    rootDir: memoryRoot,
    workingDirectory,
    workspaceRoot,
  });
  if (!requested.endsWith(MARKDOWN_SUFFIX) || contained === undefined) return decision;
  if (keepsExistingDecision(decision)) return decision;
  return allowedMemoryWrite(decision);
}

export function targetsMemoryFile(input: MemoryWriteRequest): boolean {
  const resolved = resolveMemoryFileTarget(input);
  return resolved !== undefined;
}

function allowedMemoryWrite(decision: PermissionDecisionResult): PermissionDecisionResult {
  return { ...decision, ...ALLOW_OVERRIDE, reason: ALLOW_REASON, ruleId: ALLOW_RULE_ID };
}

function resolveMemoryFileTarget(input: MemoryWriteRequest): string | undefined {
  const { executionInput, memoryRoot, toolName, workingDirectory, workspaceRoot } = input;
  if (toolName !== WRITE_TOOL_NAME && toolName !== EDIT_TOOL_NAME) return undefined;
  if (memoryRoot === undefined) return undefined;
  const requestedPath = filePathFromInput(executionInput);
  if (requestedPath === undefined) return undefined;
  const containedPath = resolveContainedMemoryFilePath({
    filePath: requestedPath,
    rootDir: memoryRoot,
    workingDirectory,
    workspaceRoot,
  });
  return containedPath;
}

function filePathFromInput(input: UnknownInput): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const candidate = (input as Record<string, unknown>).file_path;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

// deny 只有计划模式那条可覆盖；alwaysAsk 与两类 ask 一律保留。
function keepsExistingDecision(decision: PermissionDecisionResult): boolean {
  if (decision.decision === "deny") return !OVERRIDABLE_DENY_RULES.has(decision.ruleId);
  if (decision.alwaysAsk === true) return true;
  return decision.decision === "ask" && PRESERVED_ASK_RULES.has(decision.ruleId);
}
