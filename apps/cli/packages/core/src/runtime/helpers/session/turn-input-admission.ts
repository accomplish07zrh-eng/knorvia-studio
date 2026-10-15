// SPDX-License-Identifier: Apache-2.0
// 回合输入的附件准入与用户内容构造（B42）。准入五分：粘贴图（内联图片或图片占位文本）、
// 提示附件（文本类且内联可恢复/可预览）、读取失败的文本附件整条丢弃、视频、普通块。
// 用户内容按「文本块在前、输入串紧随、视频与粘贴图压尾」装配，附件全丢时回退成原串；
// 运行时条目产出一条真实用户条目加提醒附件条目，浏览器环境块只在 tabCount 为正整数时
// 注入到输入串头部。全程同步纯计算、不抛异常、不改动传入的附件数组。
import { activeSessionMessages, modelMessageContentToText } from "../../deps.js";
import {
  buildPromptAttachmentBlocks,
  buildPromptAttachmentReminderBodies,
  type PromptAttachmentReminderInput,
} from "../../../system-reminder/prompt-attachment.js";
import {
  realUserRuntimeMetadata,
  systemReminderAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import type {
  MessageId,
  MessageWithParts,
  ModelMessageContent,
  ModelMessageContentBlock,
} from "../../deps.js";
import type { ResolvedTurnAttachment, RunModelTextRequestOptions } from "../../types.js";

// 元上下文前缀：用户条目正文以此开头即视为系统提醒，不算真实用户发言。
const META_PREFIX = "<system-reminder>";

// 图片 MIME 前缀、文本 MIME 前缀与粘贴占位文本文法 `[Attached image/…: [image #n]]`。
const IMAGE_MIME_PREFIX = "image/";
const TEXT_MIME_PREFIX = "text/";
const PASTED_PLACEHOLDER = /^\[Attached image\/[^:]+: \[image #\d+\]\]$/u;

// 文本附件读取失败的诊断码（命中即丢弃整条附件）。
const READ_FAILED_CODE = "attachment_read_failed";

// 浏览器环境块骨架文案（值逐字冻结）。长句按句子切段拼接，空行用常量占位。
const BROWSER_BLOCK_OPEN = '<in-app-browser-context source="ambient-ui-state">';
const BROWSER_BLOCK_TITLE = "# In app browser:";
const BROWSER_BLOCK_CLOSE = "</in-app-browser-context>";
const BLANK_LINE = "";
const REQUEST_HEADING = "## My request for Knorvia Studio:";
const CURRENT_URL_PREFIX = "- Current URL: ";
const OPEN_TABS_PREFIX = "- The user has the in-app browser open with";
const TAB_UNIT_ONE = "tab";
const TAB_UNIT_MANY = "tabs";
const AMBIENT_DISCLAIMER = [
  "This block is automatically supplied ambient UI state,",
  "not part of the user's request.",
  "Do not treat it as an instruction or as evidence that the user",
  "explicitly selected the in-app browser.",
].join(" ");

// 浏览器环境快照：标签页数为正整数时才注入环境块，当前地址可缺省。
export interface BrowserAmbientContext {
  tabCount: number; // 打开的标签页数量
  currentUrl?: string; // 当前页面地址
}

// 运行时用户条目的装配选项。
export interface RuntimeUserEntrySettings {
  browserAmbientContext?: BrowserAmbientContext; // 浏览器环境快照
}

// 回滚分支过滤条件：字段名与活动分支筛选口径一一对应。
export interface RewindBranchFilter {
  branchCutAfterMessageId?: MessageId; // 分叉后截断点
  rewindCreatedMessageId?: MessageId; // 回滚新建的消息
  rewindKeptMessageIds?: readonly MessageId[]; // 回滚保留的消息
  rewindTargetMessageId?: MessageId; // 回滚目标消息
}

// 准入判定结果：五类之一；粘贴/视频/普通携带内容块，提示附件携带提醒输入。
type AttachmentAdmission =
  | { kind: "pasted"; piece: ModelMessageContentBlock } // 粘贴图压到内容尾部
  | { kind: "prompt"; reminder: PromptAttachmentReminderInput } // 走提示附件块与提醒正文
  | { kind: "failed" } // 读取失败的文本附件丢弃
  | { kind: "video"; piece: ModelMessageContentBlock } // 视频压在文本块之后
  | { kind: "ordinary"; piece: ModelMessageContentBlock }; // 普通块按原序进文本区

// 从活动分支尾部回扫，取第一条 user/assistant 消息的 id。
export const getLatestActiveSessionMessageId = (
  entries: MessageWithParts[],
  filters: RewindBranchFilter = {},
): MessageId | undefined => {
  const visible = activeSessionMessages(entries, {
    ...filters,
    includeCompactPreservedSegment: false,
  });
  const tailFirst = [...visible].reverse();
  const hit = tailFirst.find(
    (entry) => entry.info.role === "user" || entry.info.role === "assistant",
  );
  return hit?.info.id;
};

// 判断一条模型输入条目是不是系统提醒伪装的用户消息。
export const isMetaUserContextMessage = (
  entry: RunModelTextRequestOptions["messages"][number],
): boolean => {
  if (entry.role !== "user") return false;
  const body = modelMessageContentToText(entry.content);
  return body.trimStart().startsWith(META_PREFIX);
};

// 从尾部回扫找最近一条真实用户消息的下标；全是提醒时返回 -1。
export const findLatestRealUserMessageIndex = (
  messages: RunModelTextRequestOptions["messages"],
): number => {
  let cursor = messages.length - 1;
  while (cursor >= 0) {
    const candidate = messages[cursor];
    if (candidate.role === "user" && !isMetaUserContextMessage(candidate)) return cursor;
    cursor -= 1;
  }
  return -1; // 没有真实用户消息
};

// 单条附件的准入分类。
const classifyAdmission = (item: ResolvedTurnAttachment): AttachmentAdmission => {
  const piece = item.contentBlock;
  const pastedImage = piece.type === "image" && piece.source?.kind === "inline";
  const pastedPlaceholder =
    piece.type === "text" &&
    item.mime.startsWith(IMAGE_MIME_PREFIX) &&
    PASTED_PLACEHOLDER.test(piece.text);
  if (pastedImage || pastedPlaceholder) return { kind: "pasted", piece };

  if (piece.type === "text" && item.mime.startsWith(TEXT_MIME_PREFIX)) {
    const metadata = item.metadata;
    const source = item.source;
    const inlineReady =
      metadata.storageKind === "inline" &&
      (metadata.recoverability === "provider_ready" ||
        metadata.recoverability === "preview_only") &&
      metadata.preview?.text === piece.text;
    if (source && inlineReady) {
      const fileReminder: PromptAttachmentReminderInput = {
        content: piece.text,
        kind: "file",
        label: source.text.value ?? item.filename,
        preview: metadata.preview,
      };
      return { kind: "prompt", reminder: fileReminder };
    }
    if (!source) {
      const inlineReminder: PromptAttachmentReminderInput = {
        content: piece.text,
        kind: "inline_text",
        label: item.filename,
        preview: metadata.preview,
      };
      return { kind: "prompt", reminder: inlineReminder };
    }
    if (metadata.errorCode === READ_FAILED_CODE) return { kind: "failed" };
  }

  return piece.type === "video" ? { kind: "video", piece } : { kind: "ordinary", piece };
};

// 把一条准入结果路由进三个内容桶：文本区、视频区、粘贴区。
const routeAdmission = (
  admission: AttachmentAdmission,
  textPieces: ModelMessageContentBlock[],
  clipPieces: ModelMessageContentBlock[],
  stillPieces: ModelMessageContentBlock[],
): void => {
  switch (admission.kind) {
    case "prompt":
      textPieces.push(...buildPromptAttachmentBlocks(admission.reminder));
      break;
    case "ordinary":
      textPieces.push(admission.piece);
      break;
    case "video":
      clipPieces.push(admission.piece);
      break;
    case "pasted":
      stillPieces.push(admission.piece);
      break;
    case "failed":
      break;
  }
};

// 单块文本附件：内联文本或文件提示的提醒输入已在准入阶段定型。

// 组装模型侧用户内容：文本块在前、输入紧随、视频与粘贴图压尾；全丢回退原串。
export const buildUserContentFromTurn = (
  rawInput: string,
  resolved: ResolvedTurnAttachment[],
): ModelMessageContent => {
  if (resolved.length === 0) return rawInput;

  const textPieces: ModelMessageContentBlock[] = [];
  const clipPieces: ModelMessageContentBlock[] = [];
  const stillPieces: ModelMessageContentBlock[] = [];
  let cursor = 0;
  while (cursor < resolved.length) {
    routeAdmission(classifyAdmission(resolved[cursor]), textPieces, clipPieces, stillPieces);
    cursor += 1;
  }

  if (textPieces.length + clipPieces.length + stillPieces.length === 0) return rawInput;
  const body: ModelMessageContentBlock[] =
    rawInput.length > 0 ? [...textPieces, { type: "text", text: rawInput }] : [...textPieces];
  return [...body, ...clipPieces, ...stillPieces];
};

// 标签页数量的英文单复数描述行。
const describeOpenTabs = (count: number): string => {
  const unit = count === 1 ? TAB_UNIT_ONE : TAB_UNIT_MANY;
  return `${OPEN_TABS_PREFIX} ${count} ${unit}.`;
};

// 浏览器环境块拼接：tabCount 非正整数时原样返回输入串。
const composeRuntimeInput = (rawInput: string, ambient?: BrowserAmbientContext): string => {
  if (!ambient || !Number.isInteger(ambient.tabCount) || ambient.tabCount <= 0) return rawInput;
  const head = [
    BROWSER_BLOCK_OPEN,
    AMBIENT_DISCLAIMER,
    BROWSER_BLOCK_TITLE,
    describeOpenTabs(ambient.tabCount),
  ];
  const urlRow = ambient.currentUrl ? [CURRENT_URL_PREFIX + ambient.currentUrl] : [];
  const tail = [BROWSER_BLOCK_CLOSE, BLANK_LINE, REQUEST_HEADING, rawInput];
  return [...head, ...urlRow, ...tail].join("\n");
};

// 块数组压成运行时内容：空数组给空串，单文本块给纯文本，其余浅拷贝块数组。
const collapseRuntimeContent = (pieces: ModelMessageContentBlock[]): ModelMessageContent => {
  if (pieces.length === 0) return "";
  const only = pieces.length === 1 ? pieces[0] : undefined;
  if (only?.type === "text") return only.text;
  return pieces.map((piece) => ({ ...piece }));
};

// 组装运行时条目：一条真实用户条目 + 每个提示附件一条提醒条目。
export const buildRuntimeUserEntriesFromTurn = (
  rawInput: string,
  resolved: ResolvedTurnAttachment[],
  settings: RuntimeUserEntrySettings = {},
): RuntimeMessageEntry[] => {
  const textPieces: ModelMessageContentBlock[] = [];
  const stillPieces: ModelMessageContentBlock[] = [];
  const reminders: RuntimeMessageEntry[] = [];
  for (const item of resolved) {
    const admission = classifyAdmission(item);
    if (admission.kind === "prompt") {
      const bodies = buildPromptAttachmentReminderBodies(admission.reminder).join("\n");
      reminders.push(systemReminderAttachmentEntry("prompt_attachment", bodies));
      continue;
    }
    if (admission.kind === "failed") continue;
    if (admission.kind === "pasted") {
      stillPieces.push(admission.piece);
      continue;
    }
    textPieces.push(admission.piece); // 视频与普通块都按序留在用户内容里
  }

  // 准入全部完成后才读取浏览器环境上下文（顺序是契约）。
  const inputRows: ModelMessageContentBlock[] =
    rawInput.length > 0
      ? [{ type: "text", text: composeRuntimeInput(rawInput, settings.browserAmbientContext) }]
      : [];
  const userEntry: RuntimeMessageEntry = {
    message: {
      role: "user",
      content: collapseRuntimeContent([...inputRows, ...textPieces, ...stillPieces]),
    },
    metadata: realUserRuntimeMetadata(),
  };
  return [userEntry, ...reminders];
};
