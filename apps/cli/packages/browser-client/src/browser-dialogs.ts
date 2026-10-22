// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserDialog } from "@knorvia/contracts/browser-control";
type Respond = (accept: boolean, promptText?: string) => Promise<void>;
class DialogBase {
  readonly type: BrowserDialog["type"];
  protected readonly respond: Respond;
  constructor(type: BrowserDialog["type"], respond: Respond) {
    this.type = type;
    this.respond = respond;
  }
  dismiss(): Promise<void> {
    return this.respond(false);
  }
}
export class AlertDialog extends DialogBase {
  readonly type = "alert" as const;
}
export class BeforeUnloadDialog extends DialogBase {
  readonly type = "beforeunload" as const;
}
export class ConfirmDialog extends DialogBase {
  readonly type = "confirm" as const;
  accept(): Promise<void> {
    return this.respond(true);
  }
}
export class PromptDialog extends DialogBase {
  readonly type = "prompt" as const;
  accept(text: string): Promise<void> {
    return this.respond(true, text);
  }
}
export type JsDialog = AlertDialog | BeforeUnloadDialog | ConfirmDialog | PromptDialog;
export function createDialog(type: BrowserDialog["type"], respond: Respond): JsDialog {
  // 宿主正常只返回四种类型；字典查找仍须排除原型属性，保持未知类型的兼容行为。
  type Constructor = new (type: BrowserDialog["type"], respond: Respond) => JsDialog;
  const constructors = new Map<BrowserDialog["type"], Constructor>([
    ["alert", AlertDialog],
    ["beforeunload", BeforeUnloadDialog],
    ["confirm", ConfirmDialog],
    ["prompt", PromptDialog],
  ]);
  const Constructor = constructors.get(type) ?? AlertDialog;
  return new Constructor(type, respond);
}
