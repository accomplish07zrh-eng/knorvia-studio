// SPDX-License-Identifier: Apache-2.0
// 会话间邮箱契约：让一个会话把内容投递给另一个会话，接收方在准备好的时机取走。
// 本文件只描述读端口与信封结构；存储、排序与保留策略由实现方（宿主或存储适配层）决定。

import type { SessionId } from "./shared.js";

/** 邮箱读取端口。由邮箱实现方提供，会话运行时在开启新一轮工作前调用以取走未读邮件； 传入 `signal` 时实现必须支持取消，尚未取走的邮件保持未读。 */
export interface SessionMailboxPort {
  drainUnread(
    input: { sessionId: SessionId; limit?: number },
    options?: { signal?: AbortSignal },
  ): Promise<SessionMailboxEnvelope[]>;
}

/** 一次投递的邮件信封。投递方写入、接收方读出并归属到收件会话的上下文； `version` 标记信封结构版本，供实现方在结构演进时区分旧邮件。 */
export interface SessionMailboxEnvelope {
  version: 1;
  messageId: string;
  fromSessionId: SessionId;
  toSessionId: SessionId;
  content: string;
  createdAt: string;
}
