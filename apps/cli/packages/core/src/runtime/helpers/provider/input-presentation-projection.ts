// SPDX-License-Identifier: Apache-2.0
// 输入呈现投影与来源登记（B35）。
// 带 inputPresentation 的纯文本用户条目被改写成呈现格式；task_notification 额外包一层系统提醒
// 且**转成附件条目**；中途呈现的（isMidTurnInputPresentation 判定）一律转附件条目；内容含非
// 文本块时原样保留，无法识别的呈现格式也原样返回。登记表（WeakMap）支持「一个投影条目对应
// 多个原始条目」的链式合并，并回答「是否含真实用户」「代表条目是谁」（优先最后一个真实用户，
// 否则最后一个非附件条目）。全部同步纯计算、不抛异常；登记表按对象弱引用存储，不阻止回收，
// 且归单次投影调用所有（每次管线新建）。
import { parseRuntimeInputPresentation } from "@knorvia/contracts";
import {
  isRuntimeAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import {
  formatIncomingMessage,
  isMidTurnInputPresentation,
} from "../../../system-reminder/incoming-message.js";
import { wrapSystemReminderForSource } from "../../../system-reminder/source.js";

// 真实用户判定：普通用户消息、非续写、无工具归属、元数据缺失或标 real_user。
function isRealUser(candidate: RuntimeMessageEntry): boolean {
  if (isRuntimeAttachmentEntry(candidate)) return false;
  if (candidate.queryScope === "output_token_continuation") return false;
  const message = candidate.message;
  if (message.role !== "user" || message.toolCallId || message.toolName) return false;
  return candidate.metadata === undefined || candidate.metadata.source === "real_user";
}

// 来源登记表：投影条目 → 原始条目链（链式合并后仍能回溯到最初的输入）。
export class ProviderEntryOrigins {
  private readonly links = new WeakMap<RuntimeMessageEntry, readonly RuntimeMessageEntry[]>();

  get(item: RuntimeMessageEntry): readonly RuntimeMessageEntry[] {
    const chained = this.links.get(item);
    return chained ?? [item];
  }

  // 链式合并：把每个输入自身的来源链展开后接在新条目名下。
  set(item: RuntimeMessageEntry, inputs: readonly RuntimeMessageEntry[]): void {
    const flattened: RuntimeMessageEntry[] = [];
    for (const upstream of inputs) {
      flattened.push(...this.get(upstream));
    }
    this.links.set(item, flattened);
  }

  hasRealUser(item: RuntimeMessageEntry): boolean {
    for (const source of this.get(item)) {
      if (isRealUser(source)) return true;
    }
    return false;
  }

  // 代表条目：优先链上最后一个真实用户；否则最后一个非附件条目（纯附件没有代表条目）。
  representative(item: RuntimeMessageEntry): RuntimeMessageEntry | undefined {
    const chain = this.get(item);
    for (let cursor = chain.length - 1; cursor >= 0; cursor -= 1) {
      const candidate = chain[cursor]!;
      if (isRealUser(candidate)) return candidate;
    }
    for (let cursor = chain.length - 1; cursor >= 0; cursor -= 1) {
      const candidate = chain[cursor]!;
      if (!isRuntimeAttachmentEntry(candidate)) return candidate;
    }
    return undefined;
  }
}

export function isPresentedInput(item: RuntimeMessageEntry): boolean {
  return parseRuntimeInputPresentation(item.metadata?.inputPresentation) !== undefined;
}

// 呈现正文的拼装：纯文本条目才能投影；字符串正文原样，块正文按行拼接。
function presentedBody(content: string | readonly { type: string; text?: string }[]): string {
  if (typeof content === "string") return content;
  return content.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("\n");
}

// 单条投影：呈现格式缺失或正文含非文本块时原样返回；否则改写正文并登记来源。
function projectPresentedEntry(
  input: RuntimeMessageEntry,
  ledger: ProviderEntryOrigins,
): RuntimeMessageEntry {
  if (isRuntimeAttachmentEntry(input) || input.message.role !== "user") {
    return input;
  }
  const presentation = parseRuntimeInputPresentation(input.metadata?.inputPresentation);
  if (!presentation) {
    return input;
  }
  const content = input.message.content;
  const hasRichBlock =
    typeof content !== "string" && content.some((block) => block.type !== "text");
  if (hasRichBlock) {
    return input; // 含非文本块的输入不做呈现投影
  }

  const formatted = formatIncomingMessage(presentedBody(content), presentation);
  // task_notification 走系统提醒包装；中途呈现直接转附件条目。
  const rewritten =
    presentation === "task_notification"
      ? wrapSystemReminderForSource("incoming_message", formatted)
      : formatted;
  const output: RuntimeMessageEntry = isMidTurnInputPresentation(presentation)
    ? {
        kind: "attachment", // 中途呈现转附件形态
        content: rewritten,
        metadata: {
          source: "incoming_message", // 附件来源固定 incoming_message
          inputPresentation: presentation,
        },
      }
    : {
        ...input,
        message: { ...input.message, content: rewritten },
      };
  ledger.set(output, [input]);
  return output;
}

export function projectIncomingMessageEntries(
  entries: readonly RuntimeMessageEntry[],
  ledger: ProviderEntryOrigins,
): RuntimeMessageEntry[] {
  return entries.map((input) => projectPresentedEntry(input, ledger));
}
