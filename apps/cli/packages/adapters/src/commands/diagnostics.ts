// SPDX-License-Identifier: Apache-2.0
// 诊断收集器：命令模块所有诊断都经这里落盘；位置参数让每个调用保持单行。
import type { CustomCommandDiagnostic } from "@knorvia/contracts";

type Diags = CustomCommandDiagnostic[];
type Severity = "warning" | "error";
type Kind = "invalid" | "failed";

/** 语义 → 严重级别：命名/格式类问题是 warning，内容缺失或读取失败是 error。 */
const SEVERITY_OF_KIND: Record<Kind, Severity> = { failed: "error", invalid: "warning" };

function assemble(code: string, at: string, text: string, name?: string): CustomCommandDiagnostic {
  const diagnostic = { code, message: text, path: at } as CustomCommandDiagnostic;
  if (name !== undefined) diagnostic.commandName = name;
  return diagnostic;
}

const emit = (
  out: Diags,
  kind: Kind,
  code: string,
  at: string,
  text: string,
  name?: string,
): void => {
  const diagnostic = assemble(code, at, text, name);
  diagnostic.severity = SEVERITY_OF_KIND[kind];
  out.push(diagnostic);
};

export const warnInvalid = (
  out: Diags,
  code: string,
  at: string,
  text: string,
  name?: string,
): void => {
  emit(out, "invalid", code, at, text, name);
};

export const failInvalid = (
  out: Diags,
  code: string,
  at: string,
  text: string,
  name?: string,
): void => {
  emit(out, "failed", code, at, text, name);
};
