// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// session mailbox Hook 登记项（B17 的 6 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B17。
//
// 职责：把「其他会话发给本会话的消息」注入到当前上下文。
//
// 为什么需要它：多会话并行时，一个会话可能需要知道另一个会话的进展。
// 而消息不能直接塞进上下文（会让用户困惑「谁说的」），
// 所以用 `<session-message>` 包裹并标注来源会话。
//
// 设计要点：
//   ① 三个事件共用同一回调（UserPromptSubmit / PostToolUse / Stop）
//   ② **PostToolUse 特殊**：若有 `enqueuePendingInput`，逐条入队（不产生 additionalContext）
//      —— 因为工具执行期间注入上下文会打断当前步骤
//   ③ 消息格式化是纯函数（可精确测试转义）

/** 一条会话间消息（B17.6 的属性来源）。 */
export interface SessionMessage {
  readonly messageId: string;
  readonly fromSession: string;
  readonly createdAt: string;
  readonly text: string;
}

/** mailbox 依赖（由组合根注入）。 */
export interface SessionMailbox {
  drainUnread(
    request: { readonly sessionId: string; readonly limit: number },
    options: { readonly signal?: AbortSignal },
  ): Promise<readonly SessionMessage[]>;
}

/** 每次 drain 的上限（B17.2 明确 limit = 20）。 */
const DRAIN_LIMIT = 20;

/** 三个事件（B17.1）。 */
const MAILBOX_EVENTS = ["UserPromptSubmit", "PostToolUse", "Stop"] as const;

/** 固定 descriptor（B17.1）。 */
const DESCRIPTOR = Object.freeze({
  clientVisible: false,
  commandDisplay: "Session mailbox",
  executionMode: "foreground" as const,
  executionType: "process" as const,
  sourceKind: "internal" as const,
  timeoutMs: 60000,
});

/** 固定 source（B17.1）。 */
const SOURCE = "builtin.sessionMailbox.drain";

/** 引用提示行（B17.6）。 */
const REFERENCE_NOTICE = "For reference only. Verify against raw source before acting.";

/** 转义 XML 属性值（B17.6）：`&` → `&amp;`、`"` → `&quot;`、`<` → `&lt;`。 */
export function escapeAttribute(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;");
}

/**
 * 格式化单条消息（B17.6）。
 *
 * 形状：
 * ```
 * <session-message source="mailbox" message_id="..." from_session="..." created_at="...">
 * For reference only. Verify against raw source before acting.
 *
 * <正文>
 * </session-message>
 * ```
 */
export function formatSessionMessage(message: SessionMessage): string {
  const open = [
    `<session-message source="mailbox"`,
    `message_id="${escapeAttribute(message.messageId)}"`,
    `from_session="${escapeAttribute(message.fromSession)}"`,
    `created_at="${escapeAttribute(message.createdAt)}">`,
  ].join(" ");
  return `${open}\n${REFERENCE_NOTICE}\n\n${message.text}\n</session-message>`;
}

/** 把多条消息格式化成一段 additionalContext（B17.5）：多条之间空行分隔。 */
export function formatSessionMessages(messages: readonly SessionMessage[]): string {
  return messages.map(formatSessionMessage).join("\n\n");
}

/** 回调所需的上下文（B17.2 / B17.4）。 */
export interface MailboxCallbackContext {
  readonly hookEventName: (typeof MAILBOX_EVENTS)[number];
  readonly sessionId: string;
  readonly signal?: AbortSignal;
  readonly traceId?: string;
  readonly turnId?: string;
  /** PostToolUse 时才可能提供（B17.4）。 */
  readonly enqueuePendingInput?: (
    message: string,
    metadata: { readonly sessionId: string; readonly traceId?: string; readonly turnId?: string },
  ) => void;
}

/** 回调返回值（B17.3 / B17.5）。 */
export type MailboxCallbackResult =
  | undefined
  | {
      readonly continue?: true;
      readonly hookSpecificOutput: {
        readonly additionalContext: string;
        readonly hookEventName: string;
      };
    };

/**
 * 一次 mailbox 回调（B17.2–B17.5）。
 *
 * 分支：
 *   · 未读到消息 → `undefined`（B17.3）
 *   · PostToolUse 且提供 enqueuePendingInput → 逐条 enqueue，返回 `undefined`（B17.4）
 *   · 其他 → 合并成一个 additionalContext（B17.5）；Stop 额外带 `continue: true`
 */
export async function drainMailbox(
  mailbox: SessionMailbox,
  context: MailboxCallbackContext,
): Promise<MailboxCallbackResult> {
  const messages = await mailbox.drainUnread(
    { sessionId: context.sessionId, limit: DRAIN_LIMIT },
    context.signal === undefined ? {} : { signal: context.signal },
  );

  // B17.3：未读到消息 → undefined。
  if (messages.length === 0) return undefined;

  // B17.4：PostToolUse 且提供 enqueuePendingInput → **逐条**入队。
  if (context.hookEventName === "PostToolUse" && context.enqueuePendingInput !== undefined) {
    for (const message of messages) {
      context.enqueuePendingInput(formatSessionMessages([message]), {
        sessionId: context.sessionId,
        ...(context.traceId === undefined ? {} : { traceId: context.traceId }),
        ...(context.turnId === undefined ? {} : { turnId: context.turnId }),
      });
    }
    // 不产生 additionalContext（B17.4 末句）。
    return undefined;
  }

  // B17.5：其他情况合并成一个 additionalContext。
  return {
    // Stop 额外要求「继续」（B17.5）。
    ...(context.hookEventName === "Stop" ? { continue: true as const } : {}),
    hookSpecificOutput: {
      additionalContext: formatSessionMessages(messages),
      hookEventName: context.hookEventName,
    },
  };
}

/** 一个登记项（B17.1 的形状）。 */
export interface MailboxRegistration {
  readonly event: (typeof MAILBOX_EVENTS)[number];
  readonly source: string;
  readonly sourceKind: "internal";
  readonly descriptor: typeof DESCRIPTOR;
}

/**
 * 返回 3 个登记项（B17.1）。
 *
 * 三个事件共用同一回调 —— 所以这里只产出「登记项」，
 * 回调由 `drainMailbox` 提供（组合根把它们接起来）。
 */
export function createMailboxRegistrations(): readonly MailboxRegistration[] {
  return MAILBOX_EVENTS.map((event) => ({
    event,
    source: SOURCE,
    sourceKind: "internal" as const,
    descriptor: DESCRIPTOR,
  }));
}
