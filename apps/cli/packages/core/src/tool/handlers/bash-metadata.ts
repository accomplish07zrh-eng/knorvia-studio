// SPDX-License-Identifier: Apache-2.0
// bash 工具的对外描述投影：从调用输入取命令/描述字段，生成界面与模型可见的
// 名称、摘要与活动文案。字段缺席时各有兜底文案；全部判定总量、不抛异常。
import { isSedInPlaceBashCommand } from "./bash-semantics.js";

const DEFAULT_DESCRIPTION = "Run shell command";
const TOOL_DISPLAY_NAME = "Bash";
const IN_PLACE_EDIT_LABEL = "Update";
const ACTIVITY_WITHOUT_COMMAND = "Running command";

function textField(source: unknown, key: string): string | undefined {
  if (source === null || typeof source !== "object") return undefined;
  if (!(key in source)) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function presentText(value: string | undefined): string | undefined {
  if (!value || value.length === 0) return undefined;
  return value;
}

export function getBashDescription(input: unknown): string {
  return presentText(textField(input, "description")) ?? DEFAULT_DESCRIPTION;
}

export function getBashUserFacingName(input?: unknown): string {
  const cmd = textField(input, "command");
  if (cmd && isSedInPlaceBashCommand(cmd)) return IN_PLACE_EDIT_LABEL;
  return TOOL_DISPLAY_NAME;
}

export function getBashToolUseSummary(input?: unknown): string | null {
  const cmd = textField(input, "command");
  if (!cmd) return null;
  return presentText(textField(input, "description")) ?? cmd;
}

export function getBashActivityDescription(input?: unknown): string {
  const cmd = presentText(textField(input, "command"));
  if (!cmd) return ACTIVITY_WITHOUT_COMMAND;
  return `Running ${presentText(textField(input, "description")) ?? cmd}`;
}

export function getBashAutoClassifierInput(input: unknown): string | undefined {
  return textField(input, "command");
}

export function readStringProperty(source: unknown, key: string): string | undefined {
  return textField(source, key);
}
