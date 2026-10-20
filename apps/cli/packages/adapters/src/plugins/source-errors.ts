// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 插件来源物化失败的错误构造与查询。这里只有一种失败类型（带目录诊断码），
// 两条失败路径（缺 Git、归档取不到）各自把文案拼好后交给同一个构造器；
// 错误名与诊断码是上层依赖的稳定契约。

import type { PluginDiagnosticCode } from "@knorvia/contracts";
import { redactSourceDiagnostic, redactSourceReference } from "./source-redaction.js";

/** 上层按这个名字识别本模块的失败，改名即破坏契约。 */
const STABLE_ERROR_NAME = "PluginSourceMaterializationError";

/** 缺 Git 时的固定主句：说明前置条件、当前状态，以及两条可接受的替代来源。 */
const GIT_MISSING_ADVICE =
  "but git is unavailable on this Agent Host. Install Git on the Agent Host, " +
  "or use a public GitHub HTTPS or verified ZIP source.";

/** 仅当抛出物确实是 Error 时才取 message，否则退化成字符串化。 */
function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** errno 风格 code：只在对象且带 code 属性时读取，形状不符一律 undefined。 */
function errnoOf(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("code" in value)) return undefined;
  return (value as Record<string, unknown>).code;
}

/** 带目录诊断码的物化失败。构造参数按「码、文案、可选原因」顺序给。 */
class MaterializationFailure extends Error {
  readonly diagnosticCode: PluginDiagnosticCode;

  constructor(code: PluginDiagnosticCode, message: string, cause?: Error) {
    super(message, cause ? { cause } : undefined);
    this.name = STABLE_ERROR_NAME;
    this.diagnosticCode = code;
  }
}

/** 缺 Git：把脱敏后的来源与可选原因拼进固定句式，交给统一构造器。 */
export function createGitUnavailableError(source: string, reason?: string): Error {
  const safeSource = redactSourceReference(source);
  const hasReason = reason !== undefined && reason !== "";
  const inline = hasReason ? ` (${redactSourceDiagnostic(reason)})` : "";
  const message = `System Git is required for plugin source ${safeSource}${inline}, ${GIT_MISSING_ADVICE}`;
  return new MaterializationFailure("plugin_git_unavailable", message);
}

/** 归档取不到：脱敏后的原因同时进 message 与 cause。 */
export function createArchiveFetchError(source: string, cause: unknown): Error {
  const detail = redactSourceDiagnostic(messageOf(cause));
  const safeSource = redactSourceReference(source);
  const message = `Failed to materialize public GitHub plugin source archive ${safeSource}: ${detail}`;
  const wrapped = cause instanceof Error ? new Error(detail) : undefined;
  return new MaterializationFailure("plugin_archive_fetch_failed", message, wrapped);
}

/** 诊断码查询：命中本模块的失败类型才有值。 */
export function getPluginSourceDiagnosticCode(error: unknown): PluginDiagnosticCode | undefined {
  if (!(error instanceof MaterializationFailure)) return undefined;
  return error.diagnosticCode;
}

/** 「命令不可用」：errno 为 ENOENT，说明目标可执行文件在主机上不存在。 */
export function isCommandUnavailableError(error: unknown): boolean {
  return errnoOf(error) === "ENOENT";
}
