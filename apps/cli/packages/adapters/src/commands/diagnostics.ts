// SPDX-License-Identifier: Apache-2.0
// 诊断收集器：命令模块所有诊断都经这里落盘，严重级别与字段形状集中在一处。
import type { CustomCommandDiagnostic } from "@knorvia/contracts";

type Severity = "warning" | "error";
type Kind = "invalid" | "failed";

/** 语义 → 严重级别：命名/格式类问题是 warning，内容缺失或读取失败是 error。 */
const SEVERITY_OF_KIND: Record<Kind, Severity> = { failed: "error", invalid: "warning" };

interface DiagnosticInput {
  code: string;
  commandName?: string;
  message: string;
  path: string;
}

function emit(sink: CustomCommandDiagnostic[], kind: Kind, input: DiagnosticInput): void {
  const entry = { ...input, severity: SEVERITY_OF_KIND[kind] } as CustomCommandDiagnostic;
  sink.push(entry);
}

export function warnInvalid(sink: CustomCommandDiagnostic[], input: DiagnosticInput): void {
  emit(sink, "invalid", input);
}

export function failInvalid(sink: CustomCommandDiagnostic[], input: DiagnosticInput): void {
  emit(sink, "failed", input);
}
