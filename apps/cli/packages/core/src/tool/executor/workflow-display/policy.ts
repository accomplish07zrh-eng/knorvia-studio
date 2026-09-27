// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS,
  CREATE_WORKFLOW_DISPLAY_MAX_MESSAGE_CHARS,
  type CreateWorkflowDiagnostic,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import { boundDisplayText } from "../display-text.js";

export type WorkflowProjector = (output: unknown) => ToolResultDisplayPayload | undefined;
interface OutputSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export function fromSnapshot<T>(
  schema: OutputSchema<T>,
  project: (data: T) => ToolResultDisplayPayload,
): WorkflowProjector {
  return (output) => {
    const parsed = schema.safeParse(output);
    return parsed.success ? project(parsed.data) : undefined;
  };
}

// 一张卡片独占裁剪事实；不把字节裁剪、条目丢失和诊断字符规则混成一个隐式开关。
export class CardBudget {
  private omitted = false;
  note(value: boolean): void {
    this.omitted ||= value;
  }
  window<T>(items: T[], maximum: number, edge: "head" | "tail" = "head"): T[] {
    const selected = edge === "head" ? items.slice(0, maximum) : items.slice(-maximum);
    this.note(selected.length < items.length);
    return selected;
  }
  text(value: string, bytes: number): string {
    const result = boundDisplayText(value, bytes);
    this.note(result.truncated);
    return result.value;
  }
  optionalText(value: string | undefined, bytes: number): string | undefined {
    return value === undefined ? undefined : this.text(value, bytes);
  }
  get flag(): { truncated: true } | { truncated?: never } {
    return this.omitted ? { truncated: true } : {};
  }
}

export function diagnosticRows(
  input: CreateWorkflowDiagnostic[],
  budget: CardBudget,
): CreateWorkflowDiagnostic[] {
  return budget
    .window(input, CREATE_WORKFLOW_DISPLAY_MAX_DIAGNOSTICS)
    .map(({ line, column, code, message }) => ({
      line,
      column,
      code,
      message: message.slice(0, CREATE_WORKFLOW_DISPLAY_MAX_MESSAGE_CHARS),
    }));
}
