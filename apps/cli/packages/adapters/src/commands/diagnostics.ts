// SPDX-License-Identifier: Apache-2.0
// 诊断收集器：命令模块里所有诊断都经这里构造，字段形状集中在一处。
import type { CustomCommandDiagnostic } from "@knorvia/contracts";

interface DiagnosticInput {
  code: string;
  commandName?: string;
  message: string;
  path: string;
}

export function warnInvalid(diagnostics: CustomCommandDiagnostic[], input: DiagnosticInput): void {
  diagnostics.push({ ...input, severity: "warning" } as CustomCommandDiagnostic);
}

export function failInvalid(diagnostics: CustomCommandDiagnostic[], input: DiagnosticInput): void {
  diagnostics.push({ ...input, severity: "error" } as CustomCommandDiagnostic);
}
