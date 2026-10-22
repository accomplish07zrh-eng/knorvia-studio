// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind 测试替身：构造符合 contracts schema 的会话事件与 artifact。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/acceptance.md §5、interface.md §2.3（K10）
//
// **⚠️ 为什么需要构造器而不是硬编码 JSON**：事件必须通过 contracts 的 zod schema
// （`checkpointCreatedPayloadSchema` 是 **`.strict()`** 的！）。
// 手写 JSON 容易多写/漏写字段而让测试「因为数据不合法而通过」——那是假绿。
// 用构造器 + schema 自校验，保证夹具本身合法。
//
// **K10 的直接后果**：文件内容**不在 payload 里**，而是单独的 artifact
// （由 `makeCheckpointArtifact` 构造，测试再 seed 进 artifactStore 替身）。

import {
  checkpointCreatedPayloadSchema,
  SessionEventType,
  workspaceCheckpointArtifactSchema,
  type WorkspaceCheckpointArtifact,
} from "@knorvia/contracts";

/** 测试用的固定会话标识。 */
export const SESSION_ID = "session-fixture";

/** 测试用的固定工作区根目录（POSIX 风格；Windows 用例单独注入 path.win32）。 */
export const WORKSPACE_ROOT = "/workspace";

/** 测试用的固定消息标识。 */
export const MESSAGE_ID = "message-fixture";

/** artifact 引用前缀（与 InMemoryArtifactStore 的约定一致）。 */
const SNAPSHOT_REF_PREFIX = "artifact://";

/** 检查点里的一个文件。 */
export interface FixtureFile {
  readonly path: string;
  /** `null` 表示「检查点时该文件不存在」。 */
  readonly content: string | null;
  /** 默认由 `content` 推导；显式传 `false` 表示「当时不存在」。 */
  readonly existedBefore?: boolean;
}

/** 构造一个合法的 `WorkspaceCheckpointArtifact`（文件清单的真实载体）。 */
export function makeCheckpointArtifact(files: readonly FixtureFile[]): WorkspaceCheckpointArtifact {
  const artifact = {
    version: 1 as const,
    kind: "workspace_file_before_change" as const,
    createdAt: new Date(0).toISOString(),
    toolCallId: "tool-call-fixture",
    toolName: "Edit",
    files: files.map((file) => ({
      path: file.path,
      existedBefore: file.existedBefore ?? file.content !== null,
      beforeContent: file.content,
      // **⚠️ `structuredPatch` 是 schema 的必填字段**（不是 optional）——
      // 它是「这次变更的结构化 diff」。本包的回退只需要 `beforeContent`，
      // 但 schema 要求该字段存在，所以给一个空数组（表示「无结构化补丁」）。
      structuredPatch: [] as {
        oldStart: number;
        oldLines: number;
        newStart: number;
        newLines: number;
        lines: string[];
      }[],
    })),
  };
  // 自校验：不合法的 artifact 立刻暴露（而不是让测试假绿）。
  workspaceCheckpointArtifactSchema.parse(artifact);
  return artifact as WorkspaceCheckpointArtifact;
}

/** 检查点事件的形状（与 `SessionEvent` 对齐的最小子集）。 */
export interface FixtureSessionEvent {
  readonly id: string;
  readonly sessionId: string;
  readonly type: string;
  readonly timestamp: Date;
  readonly traceId: string;
  readonly sequenceNumber: number;
  readonly payload: unknown;
}

/** `makeCheckpointEvent` 的入参。 */
export interface CheckpointEventOptions {
  readonly checkpointId: string;
  readonly files: readonly FixtureFile[];
  /** 置真时故意把 payload 造坏（用于测 K8.1 的「跳过脏数据」）。 */
  readonly corrupt?: boolean;
}

/**
 * 构造一条 `CheckpointCreated` 事件。
 *
 * **⚠️ payload 里没有文件内容**（K10）：只有 `snapshotRef` 这个 URI 引用。
 * 文件内容要用返回的 `artifact` seed 进 artifactStore 替身。
 *
 * @returns `event` 与 `artifact` 两个产物
 */
export function makeCheckpointEvent(options: CheckpointEventOptions): {
  event: FixtureSessionEvent;
  artifact: WorkspaceCheckpointArtifact;
} {
  const artifact = makeCheckpointArtifact(options.files);

  const payload = options.corrupt
    ? // 故意缺必填字段（`checkpointId` 为空串、`snapshotRef` 缺失）→ schema 解析应失败。
      { checkpointId: "", messageId: "", scope: "workspace" }
    : {
        checkpointId: options.checkpointId,
        messageId: MESSAGE_ID,
        scope: "workspace",
        snapshotRef: `${SNAPSHOT_REF_PREFIX}${options.checkpointId}`,
        fileCount: options.files.length,
      };

  // 自校验：合法的 payload 必须能过 schema（corrupt 的故意不过）。
  if (options.corrupt !== true) checkpointCreatedPayloadSchema.parse(payload);

  return {
    artifact,
    event: {
      id: `event-${options.checkpointId}`,
      sessionId: SESSION_ID,
      type: SessionEventType.CheckpointCreated,
      timestamp: new Date(1_700_000_000_000),
      traceId: "trace-fixture",
      sequenceNumber: 1,
      payload,
    },
  };
}

/**
 * 构造一条带消息标识的事件（用于会话回退规划）。
 *
 * 用 `RewindTriggered` 类型并带 `targetMessageId`，因为 `planConversationRewind`
 * 从 payload 的 `messageId` / `targetMessageId` 里找消息。
 */
export function makeRewindEvent(options: {
  sequenceNumber: number;
  messageId: string;
}): FixtureSessionEvent {
  return {
    id: `event-seq-${options.sequenceNumber}`,
    sessionId: SESSION_ID,
    type: SessionEventType.RewindTriggered,
    timestamp: new Date(1_700_000_000_000 + options.sequenceNumber * 1000),
    traceId: "trace-fixture",
    sequenceNumber: options.sequenceNumber,
    payload: {
      scope: "conversation",
      targetMessageId: options.messageId,
      reason: "fixture",
    },
  };
}
