// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// 输入历史端口 —— 用户敲过什么，以及怎么按上箭头捞回来
// ════════════════════════════════════════════════════════════
// 用户按上箭头时期待看到自己上一条输入，所以这份历史要按项目记账：换项目之后上下文也换了，历史不该
// 串味。落库、去重、保留多少条全归实现方，本文件只给出条目形状与「记一条 / 捞上一条」两个入口。

// 所有权：条目 id 与时间由实现侧生成，写入时调用方给的 time 只算建议；读出来的条目是快照，改它不会
// 影响存储里的那一份。

// 章节：一 条目形状 · 二 写入入参 · 三 回捞入参 · 四 端口本体

import type { InputHistoryId, ProjectId, SessionId } from "./shared.js";

// ── 一、条目形状：一条输入由哪些部分组成 ─────────────────────────────

/** 随输入一起提交的附件：能取到本地路径的给 path，纯文本或链接内容放进 content。 */
export interface InputHistoryAttachment {
  type: "file" | "image" | "pdf" | "url";
  path?: string;
  content?: string;
}

/** 这条输入是怎么来的：用户直接敲的、用斜杠命令发起的，还是运行中途插话补的。 */
export type InputHistoryKind = "prompt" | "steered_input" | "slash_command";

/** 历史里的一条记录。项目归属必填（历史按项目隔离），会话可以缺席——脱离具体会话记下的内容依旧属于 这个项目；time 只留创建时刻，条目一旦写下就不再变化。 */
export interface InputHistoryEntry {
  id: InputHistoryId;
  projectID: ProjectId;
  sessionID?: SessionId;
  text: string;
  attachments?: InputHistoryAttachment[];
  kind: InputHistoryKind;
  time: {
    created: number;
  };
}

// ── 二、写入入参：记一条历史需要什么 ─────────────────────────────────

/** 写入请求；time.created 可选，调用方不传、或者只给一个空壳时由实现填当前时刻。 */
export interface RecordInputHistoryInput {
  projectID: ProjectId;
  sessionID?: SessionId;
  text: string;
  attachments?: InputHistoryAttachment[];
  kind: InputHistoryKind;
  time?: {
    created?: number;
  };
}

// ── 三、回捞入参：上一条历史怎么定位 ─────────────────────────────────

/** 回捞请求：skip 表示往前跳几条，0 或缺席就是最近一条。 */
export interface RecallPreviousInputHistoryInput {
  projectID: ProjectId;
  skip?: number;
}

// ── 四、端口本体：写入与回捞 ─────────────────────────────────────────

/** 输入历史存储的能力面。两个方法都可能交回 null：写入没产生新条目（例如被判重规则忽略）或者已经 退到历史尽头，都是正常结果而非异常，调用方据此决定「这次不提示」。 */
export interface InputHistoryStorePort {
  recordInputHistory(input: RecordInputHistoryInput): Promise<InputHistoryEntry | null>;
  recallPreviousInputHistory(
    input: RecallPreviousInputHistoryInput,
  ): Promise<InputHistoryEntry | null>;
}
