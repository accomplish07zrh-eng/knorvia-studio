// SPDX-License-Identifier: Apache-2.0
// 会话分叉的克隆与引用重映射（B19）。
// 克隆体一律「copy by value + provenance」：child 用新会话 id 与新消息/分片 id 排序、渲染、续写，
// metadata.forkOrigin 只记溯源与 debug，不参与 child 的 UI placement。
// 本地引用重映射口径：可映射就换新 id；strictLocalReferences 打开时映射不到一律抛错并点名
// 字段（消息、锚点、时间线、压缩边界、工具调用、附件）；关闭时按「可映射则换、否则保留/降级」
// 处理——时间线锚点换不动就清空并降级到 origin* 溯源字段（绝不把父 id 当 child 本地锚点），
// compaction 内部引用属 provider-context 语义，换不动保留原值。同步纯计算，不产生 I/O。
import { createPartId } from "../../deps.js";
import type { MessageId, MessageInfo, MessagePart, SessionId, TurnId } from "../../deps.js";

type MessageAnchor = NonNullable<MessageInfo["anchor"]>;

// 失败文案里点名的字段名（逐字冻结，点名是协议面）。
const FORK_FIELD_LABELS = {
  anchorTurn: "anchor turn",
  anchorProductTurn: "anchor product turn",
  anchorOrderedMessage: "anchor orderedMessageId",
  anchorBoundaryMessage: "anchor boundaryMessageId",
  goalTarget: "goal target",
  goalVerifier: "goal verifier entry",
  timelineSummary: "timeline summaryMessageId",
  timelineAnchorTurn: "timeline anchorTurnId",
  compactionSummary: "compaction summaryMessageId",
  compactionTailStart: "compaction tail_start_id",
  boundarySummary: "compact boundary summaryMessageId",
  boundaryAttachment: "compact boundary attachmentMessageId",
  boundaryHookResult: "compact boundary hookResultMessageIds",
  boundaryTurn: "compact boundary turnId",
  preservedHead: "compact preserved headMessageId",
  preservedAnchor: "compact preserved anchorMessageId",
  preservedTail: "compact preserved tailMessageId",
} as const;

// 目标快照重建时清空的活动运行字段（快照落位不带活动态，三键一起置空）。
const CLEARED_RUN_STATE = {
  activeInputId: null,
  activeRunStartedAtMs: null,
  activeRunLastSeenAtMs: null,
};

// 消息克隆的分叉上下文：字段名是兼容接口（调用方按名传参）。
export interface ForkMessageCloneSettings {
  forkedSessionId: /* 新会话 id */ SessionId;
  messageIdMap: /* 原消息 id → 新消息 id */ Map<MessageId, MessageId>;
  nextMessageId: /* 克隆体的新消息 id */ MessageId;
  turnIdMap?: /* 原回合 id → 新回合 id */ Map<string, string>;
  productTurnIdMap?: /* 产品回合 id 映射 */ Map<string, string>;
  targetIdMap?: /* 目标 id 映射 */ Map<string, string>;
  verificationEntryIdMap?: /* 校验条目 id 映射 */ Map<string, string>;
  strictLocalReferences?: /* 打开后映射不到即抛错 */ boolean;
}

// 分片克隆的分叉上下文：字段名是兼容接口（调用方按名传参）。
export interface ForkPartCloneSettings {
  forkedSessionId: /* 新会话 id */ SessionId;
  nextMessageId: /* 归属的新消息 id */ MessageId;
  nextPartId?: /* 指定新分片 id；缺省随机生成 */ MessagePart["id"];
  partIdMap?: /* 附件分片 id 映射 */ Map<MessagePart["id"], MessagePart["id"]>;
  messageIdMap?: /* 原消息 id → 新消息 id */ Map<MessageId, MessageId>;
  turnIdMap?: /* 原回合 id → 新回合 id */ Map<string, string>;
  targetIdMap?: /* 目标 id 映射 */ Map<string, string>;
  verificationIdMap?: /* 校验 id 映射 */ Map<string, string>;
  toolCallIdMap?: /* 工具调用 id 映射 */ Map<string, string>;
  strictLocalReferences?: /* 打开后映射不到即抛错 */ boolean;
}

// 映射器口径：有映射就用映射值；没有映射时 strict 抛错、宽松保留原值。
function keepOrThrow<T>(
  mapped: T | undefined,
  original: T,
  strict: boolean | undefined,
  problem: string,
): T {
  if (!mapped && strict) throw new Error(problem);
  return mapped ?? original;
}

export const cloneMessageForFork = (
  source: MessageInfo,
  settings: ForkMessageCloneSettings,
): MessageInfo => {
  // copy by value + provenance：forkOrigin 只供溯源与 debug。
  const originTrail = {
    sessionId: String(source.sessionID),
    messageId: String(source.id),
  };
  const provenance = { ...source.metadata, forkOrigin: originTrail };
  const anchor = source.anchor ? remapMessageAnchor(source.anchor, settings) : undefined;
  if (source.role === "user") {
    return {
      ...source,
      id: settings.nextMessageId,
      sessionID: settings.forkedSessionId,
      ...(anchor === undefined ? {} : { anchor }),
      metadata: provenance,
    };
  }

  const mappedParent = keepOrThrow(
    settings.messageIdMap.get(source.parentID),
    source.parentID,
    settings.strictLocalReferences,
    `Fork assistant parent is outside child transcript: ${source.parentID}`,
  );
  return {
    ...source,
    id: settings.nextMessageId,
    sessionID: settings.forkedSessionId,
    parentID: mappedParent,
    ...(anchor === undefined ? {} : { anchor }),
    metadata: provenance,
  };
};

// 锚点重映射：turn/productTurn/有序消息/边界消息/目标快照逐项换新值，字段名进失败文案。
function remapMessageAnchor(
  anchor: MessageAnchor,
  settings: ForkMessageCloneSettings,
): MessageAnchor {
  const toLocalMessage = (id: MessageId, label: string): MessageId =>
    keepOrThrow(
      settings.messageIdMap.get(id),
      id,
      settings.strictLocalReferences,
      `Fork ${label} is outside child transcript: ${id}`,
    );
  const toLocalIdentity = (
    id: string,
    maps: Map<string, string> | undefined,
    label: string,
  ): string =>
    keepOrThrow(
      maps?.get(id),
      id,
      settings.strictLocalReferences,
      `Fork ${label} has no child-local identity: ${id}`,
    );

  // 目标快照要重建 target（换新会话/目标 id 并清空活动运行字段），其余分支原样带过。
  let goalBoundary = anchor.goalBoundary;
  if (anchor.goalBoundary?.kind === "snapshot") {
    const snapshot = anchor.goalBoundary;
    goalBoundary = {
      kind: "snapshot",
      target: {
        ...snapshot.target,
        sessionID: settings.forkedSessionId,
        targetID: toLocalIdentity(
          snapshot.target.targetID,
          settings.targetIdMap,
          FORK_FIELD_LABELS.goalTarget,
        ),
        ...CLEARED_RUN_STATE,
      },
      verificationEntryIds: snapshot.verificationEntryIds.map((id) =>
        toLocalIdentity(id, settings.verificationEntryIdMap, FORK_FIELD_LABELS.goalVerifier),
      ),
    };
  }

  const rebuilt: MessageAnchor = { ...anchor };
  if (anchor.turnId) {
    rebuilt.turnId = toLocalIdentity(
      String(anchor.turnId),
      settings.turnIdMap,
      FORK_FIELD_LABELS.anchorTurn,
    ) as TurnId;
  }
  if (anchor.productTurnId) {
    rebuilt.productTurnId = toLocalIdentity(
      anchor.productTurnId,
      settings.productTurnIdMap,
      FORK_FIELD_LABELS.anchorProductTurn,
    );
  }
  if (anchor.orderedMessageIds) {
    rebuilt.orderedMessageIds = anchor.orderedMessageIds.map((id) =>
      toLocalMessage(id, FORK_FIELD_LABELS.anchorOrderedMessage),
    );
  }
  if (anchor.boundaryMessageId) {
    rebuilt.boundaryMessageId = toLocalMessage(
      anchor.boundaryMessageId,
      FORK_FIELD_LABELS.anchorBoundaryMessage,
    );
  }
  if (goalBoundary) {
    rebuilt.goalBoundary = goalBoundary;
  }
  return rebuilt;
}

export const clonePartForFork = (
  source: MessagePart,
  settings: ForkPartCloneSettings,
): MessagePart => {
  const cloned = {
    ...source,
    id: settings.nextPartId ?? createPartId(),
    sessionID: settings.forkedSessionId,
    messageID: settings.nextMessageId,
  } as MessagePart;
  const messageIdMap = settings.messageIdMap;
  if (!messageIdMap) return cloned;

  // part 级内嵌引用 remap（不得原样拷贝父 id）：按分片种类分派。
  if (cloned.type === "timeline") {
    remapTimelinePart(cloned, settings);
  }
  if (cloned.type === "compaction") {
    remapCompactionPart(cloned, settings);
  }
  if (cloned.type === "tool") {
    remapToolPart(cloned, settings);
  }
  return cloned;
};

type TimelinePartLike = Extract<MessagePart, { type: "timeline" }>;
type CompactionPartLike = Extract<MessagePart, { type: "compaction" }>;
type ToolPartLike = Extract<MessagePart, { type: "tool" }>;

// 时间线锚点参与 child 落位：可 remap 则换 local id；不可 remap 必须清空并降级
// originAnchor*（不得把父 id 当 child 本地锚点），strict 模式直接点名抛错。
function remapTimelinePart(part: TimelinePartLike, settings: ForkPartCloneSettings): void {
  const strict = settings.strictLocalReferences;
  if (part.anchorMessageId) {
    const mapped = settings.messageIdMap?.get(part.anchorMessageId);
    if (mapped) {
      part.anchorMessageId = mapped;
    } else if (strict) {
      throw new Error(
        `Fork timeline anchorMessageId is outside child transcript: ${part.anchorMessageId}`,
      );
    } else {
      part.originAnchorMessageId = part.anchorMessageId;
      delete part.anchorMessageId;
    }
  }
  if (part.anchorTurnId) {
    if (settings.turnIdMap?.has(String(part.anchorTurnId))) {
      part.anchorTurnId = keepOrThrow<string>(
        settings.turnIdMap.get(String(part.anchorTurnId)),
        part.anchorTurnId,
        strict,
        `Fork ${FORK_FIELD_LABELS.timelineAnchorTurn} has no child-local identity: ${part.anchorTurnId}`,
      ) as TurnId;
    } else if (strict) {
      throw new Error(
        `Fork ${FORK_FIELD_LABELS.timelineAnchorTurn} has no child-local identity: ${part.anchorTurnId}`,
      );
    } else {
      // legacy workspace fork 没有完整 turn identity map，只能显式降级为 provenance。
      part.originAnchorTurnId = part.anchorTurnId;
      delete part.anchorTurnId;
    }
  }
  if (part.timelineType === "context_compaction" && part.summaryMessageId) {
    part.summaryMessageId = keepOrThrow(
      settings.messageIdMap?.get(part.summaryMessageId),
      part.summaryMessageId,
      strict,
      `Fork ${FORK_FIELD_LABELS.timelineSummary} is outside child transcript: ${part.summaryMessageId}`,
    );
  }
  if (part.timelineType === "goal_verification") {
    const targetId = settings.targetIdMap?.get(part.targetId);
    const verificationId = settings.verificationIdMap?.get(part.verificationId);
    if ((!targetId || !verificationId) && strict) {
      throw new Error("Fork goal verification timeline has no child-local identity");
    }
    part.targetId = targetId ?? part.targetId;
    part.verificationId = verificationId ?? part.verificationId;
  }
}

// compaction 内部引用是 provider-context 语义（非 UI 落位）：可 remap 则换，否则保留原值
// （保持既有语义，不引入破坏性变更）。
function remapCompactionPart(part: CompactionPartLike, settings: ForkPartCloneSettings): void {
  const strict = settings.strictLocalReferences;
  const mapMessage = (id: MessageId, label: string): MessageId =>
    keepOrThrow(
      settings.messageIdMap?.get(id),
      id,
      strict,
      `Fork ${label} is outside child transcript: ${id}`,
    );
  if (part.summaryMessageId) {
    part.summaryMessageId = mapMessage(part.summaryMessageId, FORK_FIELD_LABELS.compactionSummary);
  }
  if (part.tail_start_id) {
    part.tail_start_id = mapMessage(part.tail_start_id, FORK_FIELD_LABELS.compactionTailStart);
  }
  if (!part.compactBoundary) return;

  const boundary = part.compactBoundary;
  const rebuiltBoundary = { ...boundary };
  if (boundary.lastSummarizedMessageId) {
    rebuiltBoundary.lastSummarizedMessageId = mapMessage(
      boundary.lastSummarizedMessageId,
      FORK_FIELD_LABELS.boundarySummary,
    );
  }
  rebuiltBoundary.summaryMessageIds = boundary.summaryMessageIds.map((id) =>
    mapMessage(id, FORK_FIELD_LABELS.boundarySummary),
  );
  if (boundary.attachmentMessageIds) {
    rebuiltBoundary.attachmentMessageIds = boundary.attachmentMessageIds.map((id) =>
      mapMessage(id as MessageId, FORK_FIELD_LABELS.boundaryAttachment),
    );
  }
  if (boundary.hookResultMessageIds) {
    rebuiltBoundary.hookResultMessageIds = boundary.hookResultMessageIds.map((id) =>
      mapMessage(id as MessageId, FORK_FIELD_LABELS.boundaryHookResult),
    );
  }
  if (boundary.preservedSegment) {
    const segment = boundary.preservedSegment;
    rebuiltBoundary.preservedSegment = {
      headMessageId: mapMessage(segment.headMessageId, FORK_FIELD_LABELS.preservedHead),
      anchorMessageId: mapMessage(segment.anchorMessageId, FORK_FIELD_LABELS.preservedAnchor),
      tailMessageId: mapMessage(segment.tailMessageId, FORK_FIELD_LABELS.preservedTail),
    };
  }
  if (boundary.turnId) {
    rebuiltBoundary.turnId = keepOrThrow<string>(
      settings.turnIdMap?.get(String(boundary.turnId)),
      boundary.turnId,
      strict,
      `Fork ${FORK_FIELD_LABELS.boundaryTurn} has no child-local identity: ${boundary.turnId}`,
    ) as TurnId;
  }
  part.compactBoundary = rebuiltBoundary;
}

// 工具结果附件的分片 id、会话与消息归属一并重建；未映射的附件 id 在宽松模式换新随机 id。
function remapToolPart(part: ToolPartLike, settings: ForkPartCloneSettings): void {
  const strict = settings.strictLocalReferences;
  const callID = settings.toolCallIdMap?.get(part.callID);
  if (!callID && strict) {
    throw new Error(`Fork tool call has no child-local identity: ${part.callID}`);
  }
  part.callID = callID ?? part.callID;
  if (part.state.status !== "completed" || !part.state.attachments) return;

  part.state = {
    ...part.state,
    attachments: part.state.attachments.map((attachment) => {
      const nextPartId = settings.partIdMap?.get(attachment.id);
      if (!nextPartId && strict) {
        throw new Error(`Fork tool attachment has no child-local part identity: ${attachment.id}`);
      }
      return {
        ...attachment,
        id: nextPartId ?? createPartId(), // 映射不到就换新随机 id
        sessionID: settings.forkedSessionId,
        messageID: settings.nextMessageId,
      };
    }),
  };
}
