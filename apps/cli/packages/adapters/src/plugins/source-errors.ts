// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { PluginDiagnosticCode } from "@knorvia/contracts";
import { redactSourceDiagnostic, redactSourceReference } from "./source-redaction.js";

export function createGitUnavailableError(
  source: /* 出错的来源引用 */ string,
  reason?: /* 具体缺失原因，可省略 */ string,
): Error {
  const reference = redactSourceReference(source);
  /* 有具体原因时拼成括号说明，没有就不加 */
  const notes: string[] = [];
  if (reason) notes.push(` (${redactSourceDiagnostic(reason)})`);
  return new SourceMaterializationFailure({
    code: /* 主机缺 Git */ "plugin_git_unavailable",
    message: `System Git is required for plugin source ${reference}${notes.join("")}, but git is unavailable on this Agent Host. Install Git on the Agent Host, or use a public GitHub HTTPS or verified ZIP source.`,
  });
}

export function createArchiveFetchError(
  source: /* 来源引用 */ string,
  cause: /* 底层失败原因 */ unknown,
): Error {
  const detail = redactSourceDiagnostic(cause instanceof Error ? cause.message : String(cause));
  return new SourceMaterializationFailure({
    code: /* 归档获取失败 */ "plugin_archive_fetch_failed",
    message: `Failed to materialize public GitHub plugin source archive ${redactSourceReference(source)}: ${detail}`,
    options: cause instanceof Error ? { cause: new Error(detail) } : undefined,
  });
}

export function getPluginSourceDiagnosticCode(
  error: /* 捕获到的异常 */ unknown,
): PluginDiagnosticCode | undefined {
  /* 只有本模块的物化失败类才携带目录诊断码 */
  if (error instanceof SourceMaterializationFailure) return error.diagnosticCode;
  return undefined;
}

/** 取出异常对象上的 errno 风格 code；形状不符时返回 undefined。 */
function errorCodeOf(candidate: unknown): unknown {
  if (typeof candidate !== "object" || candidate === null) return undefined;
  if (!("code" in candidate)) return undefined;
  return candidate.code;
}

export function isCommandUnavailableError(error: /* 待判定的异常 */ unknown): boolean {
  return errorCodeOf(error) === "ENOENT";
}

/** 源码物化失败：携带目录诊断码；对外错误名与文案保持既有契约。 */
class SourceMaterializationFailure extends Error {
  readonly /* 目录诊断码（供上层读取） */ diagnosticCode: PluginDiagnosticCode;

  constructor(facts: { code: PluginDiagnosticCode; message: string; options?: ErrorOptions }) {
    super(facts.message, facts.options);
    this.name = /* 稳定错误名 */ "PluginSourceMaterializationError";
    this.diagnosticCode = facts.code;
  }
}
