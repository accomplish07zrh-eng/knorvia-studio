// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01: 会话快照物化与 revision 推进（合同 B8–B11）
//
// 本文件是桥自己的快照事实源：初始快照完全按 @knorvia/shared/protocol-v4 的
// ConversationSnapshot schema 逐字段构造，不依赖旧运行时的 projection 状态工厂。
// revision 只在用户可见状态实际变化时推进；同值配置命令仍占一个事件序号，但不改快照。

import { resolveExecutionState, type ExecutionState } from "@knorvia/shared";
import type {
  ConversationDelta,
  ConversationSnapshot,
  SessionConfigState,
  StatePatch,
} from "@knorvia/shared/protocol-v4";
import type { BridgeConfigMutationInput } from "./interface.js";

export interface ConfigMutationOutcome {
  readonly changed: boolean;
  readonly revision: number;
  readonly deltas: readonly ConversationDelta[];
  readonly nextConfig: SessionConfigState;
}

const PERMISSION_MODES: readonly ExecutionState["mode"][] = ["build", "edit", "yolo", "auto"];

/** 把任意字符串模式收窄到 execution-state 词表；未知值按 build 处理。 */
function normalizePermissionMode(mode: string): ExecutionState["mode"] {
  const matched = PERMISSION_MODES.find((candidate) => candidate === mode);
  return matched ?? "build";
}

/** 草稿会话的 action 裁决：与 phase 的可见语义一致，未启动的会话不能 fork/compact/stop。 */
function draftAvailability(): ConversationSnapshot["availability"] {
  return {
    fork: { allowed: false, reasonCode: "forkTargetNotStable" },
    compact: { allowed: false, reasonCode: "idleCannotCompact" },
    switchModelConfig: { allowed: true },
    setFollowupMode: { allowed: true },
    queueEdit: { allowed: true },
    sendQueuedNow: { allowed: false, reasonCode: "sendQueuedNowRequiresRunning" },
    pauseGoal: { allowed: false, reasonCode: "noGoalToPause" },
    resumeGoal: { allowed: false, reasonCode: "noGoalToResume" },
  };
}

/** 草稿态空队列的输入路由：没有运行中的 turn，输入直接开始新一轮。 */
function draftInputRouting(): ConversationSnapshot["inputRouting"] {
  return { mode: "startNow" };
}

/** 按 schema 构造草稿快照；initialConfig 只覆盖 config，不伪造任何可见事实。 */
export class SnapshotMaterializer {
  static createDraftSnapshot(
    sessionId: string,
    logEpoch: string,
    initialConfig?: Partial<SessionConfigState>,
  ): ConversationSnapshot {
    const config: SessionConfigState = {
      provider: "",
      model: "",
      thought: "",
      thoughtLevels: [],
      followupMode: "queue",
      mode: "build",
      planEnabled: false,
      ...initialConfig,
    };

    return {
      protocolVersion: 1,
      sessionId,
      logEpoch,
      seq: 0,
      revision: 0,
      control: {
        phase: "draft",
        sessionEnded: false,
        canStop: false,
        stopState: "idle",
        stopTargetKind: "unknown",
        activeWorks: [],
        lastError: null,
        apiRetry: null,
      },
      availability: draftAvailability(),
      inputRouting: draftInputRouting(),
      meta: { title: "", titleSource: "default" },
      config,
      modelTransition: null,
      usage: {
        contextWindow: null,
        cumulative: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      queue: { items: [], autoDrain: true },
      pendingInteractions: [],
      pendingCommands: [],
      backgroundWorks: [],
      subagents: { revision: 0, childSessionIds: [], running: [], endedTotal: 0 },
      goal: null,
      plan: null,
      workspaceHookAdmission: null,
      rows: { window: [], totalCount: 0, firstRowId: null },
    };
  }

  /**
   * 应用配置变更并判定 revision 是否推进。
   *
   * - followupMode 独立于权限模式；同值不产生 delta。
   * - mode/planEnabled 交给共享的 resolveExecutionState 归约：plan 是正交开关，
   *   不会写进 mode（mode 只取 build/edit/yolo/auto）。
   * - 只有归约结果与当前 config 不同才算可见变更；no-op 返回空 deltas，revision 不动。
   */
  static applyConfigMutation(
    currentSnapshot: ConversationSnapshot,
    mutation: BridgeConfigMutationInput["mutation"],
    currentRevision: number,
  ): ConfigMutationOutcome {
    const currentConfig = currentSnapshot.config;

    let followupMode = currentConfig.followupMode;
    let followupChanged = false;
    if (mutation.followupMode !== undefined && mutation.followupMode !== currentConfig.followupMode) {
      followupMode = mutation.followupMode;
      followupChanged = true;
    }

    let mode = currentConfig.mode;
    let planEnabled = currentConfig.planEnabled ?? false;
    let executionChanged = false;
    if (mutation.mode !== undefined || mutation.planEnabled !== undefined) {
      const currentExecution: ExecutionState = {
        mode: normalizePermissionMode(currentConfig.mode),
        planEnabled: currentConfig.planEnabled ?? false,
      };
      const resolved = resolveExecutionState(
        { mode: mutation.mode, planEnabled: mutation.planEnabled },
        currentExecution,
      );
      if (resolved.mode !== currentExecution.mode || resolved.planEnabled !== currentExecution.planEnabled) {
        mode = resolved.mode;
        planEnabled = resolved.planEnabled;
        executionChanged = true;
      }
    }

    if (!followupChanged && !executionChanged) {
      return {
        changed: false,
        revision: currentRevision,
        deltas: [],
        nextConfig: currentConfig,
      };
    }

    const nextRevision = currentRevision + 1;
    const nextConfig: SessionConfigState = {
      ...currentConfig,
      followupMode,
      mode,
      planEnabled,
    };
    const patch: StatePatch = {
      revision: nextRevision,
      config: nextConfig,
    };
    const delta: ConversationDelta = { op: "state.updated", patch };

    return {
      changed: true,
      revision: nextRevision,
      deltas: [delta],
      nextConfig,
    };
  }

  /**
   * 为链路打帧取快照副本。两个 clientMode 共用同一份内容，profile 不改变快照。
   */
  static getWireSnapshot(snapshot: ConversationSnapshot): ConversationSnapshot {
    return {
      ...snapshot,
      rows: {
        ...snapshot.rows,
      },
    };
  }
}
