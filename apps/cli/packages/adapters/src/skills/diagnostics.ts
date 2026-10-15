// SPDX-License-Identifier: Apache-2.0
// 技能诊断：位置参数让每个调用保持单行，严重级别集中在一处。
import type { SkillDiagnostic } from "@knorvia/contracts";

type Sink = SkillDiagnostic[];
type Level = "warning" | "error";
type Kind = "invalid" | "failed";

/** 语义 → 严重级别：可继续的格式/读取问题警告，准入失败才是错误。 */
const SEVERITY_OF_KIND: Record<Kind, Level> = { failed: "error", invalid: "warning" };

function assemble(code: string, at: string, text: string, skillName?: string): SkillDiagnostic {
  const diagnostic = { code, message: text, path: at } as SkillDiagnostic;
  if (skillName !== undefined) diagnostic.skillName = skillName;
  return diagnostic;
}

const emit = (
  out: Sink,
  kind: Kind,
  code: string,
  at: string,
  text: string,
  skillName?: string,
): void => {
  const diagnostic = assemble(code, at, text, skillName);
  diagnostic.severity = SEVERITY_OF_KIND[kind];
  out.push(diagnostic);
};

export const warnSkill = (
  out: Sink,
  code: string,
  at: string,
  text: string,
  skillName?: string,
): void => {
  emit(out, "invalid", code, at, text, skillName);
};

export const failSkill = (
  out: Sink,
  code: string,
  at: string,
  text: string,
  skillName?: string,
): void => {
  emit(out, "failed", code, at, text, skillName);
};
