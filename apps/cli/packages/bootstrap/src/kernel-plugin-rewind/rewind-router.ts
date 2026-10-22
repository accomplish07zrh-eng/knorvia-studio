// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：按 scope 分派回退请求（路由器）。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{behavior,interface}.md B7、§六
//
// 对应旧实现的 `rewind-message.ts`（114 行，4 个导出）—— 它是**路由器**，
// **不调 fork**（`git grep 'fork|Fork'` 零命中，已核实）。
//
// 三条 scope 的语义：
//   · `workspace`     → 只做文件回退（本模块全权处理）
//   · `conversation`  → 只算会话目标（**不执行 fork**，L5）
//   · `both`          → 先算会话目标，再做文件回退（顺序：先规划、后执行）

import type { SessionEvent } from "@knorvia/contracts";
import {
  REWIND_SCOPE,
  planConversationRewind,
  type ConversationPlan,
  type RewindScope,
} from "./conversation-plan.js";
import type { RewindApplyResult } from "./file-rewind-apply.js";
import type { RewindPlan } from "./file-rewind-plan.js";

/** 路由器需要的三件事：两个规划器 + 一个执行器（都由 handle 注入）。 */
export interface RewindRouterDeps {
  readonly planWorkspace: () => Promise<RewindPlan>;
  readonly applyWorkspace: (checkpointId: string) => Promise<RewindApplyResult>;
  readonly readEvents: () => Promise<readonly SessionEvent[]>;
}

/** 一次回退请求。 */
export interface RewindRequest {
  readonly scope: RewindScope;
  /** `scope` 含 conversation 时必填。 */
  readonly targetMessageId?: string;
  /** `scope` 含 workspace 时必填。 */
  readonly targetCheckpointId?: string;
}

/** 路由器结果：两条路径各自的结果，互不掩盖。 */
export interface RewindOutcome {
  readonly scope: RewindScope;
  readonly conversation?: ConversationPlan;
  readonly workspace?: RewindPlan;
  readonly applied?: RewindApplyResult;
  readonly unavailableReason?: string;
}

/**
 * 按 scope 分派。
 *
 * **顺序**：会话**先规划**（拿到目标 seq 后由调用方决定是否执行 fork），
 * 然后做文件回退。这样若会话不可回退，文件也不会被改（避免「只回退一半」）。
 */
export async function executeRewind(
  request: RewindRequest,
  deps: RewindRouterDeps,
): Promise<RewindOutcome> {
  const wantsConversation =
    request.scope === REWIND_SCOPE.Conversation || request.scope === REWIND_SCOPE.Both;
  const wantsWorkspace =
    request.scope === REWIND_SCOPE.Workspace || request.scope === REWIND_SCOPE.Both;

  let conversation: ConversationPlan | undefined;

  // ── 第一步：会话只规划（L5：不执行 fork）────────────────────────────────
  if (wantsConversation) {
    if (request.targetMessageId === undefined || request.targetMessageId.length === 0) {
      return {
        scope: request.scope,
        unavailableReason: "targetMessageId is required for a conversation rewind",
      };
    }
    const events = await deps.readEvents();
    conversation = planConversationRewind(events, request.targetMessageId);
    // 会话不可回退 → 整体停下（不改文件，避免「只回退一半」）。
    if (!conversation.available) {
      return {
        scope: request.scope,
        conversation,
        unavailableReason: conversation.unavailableReason ?? "conversation rewind is unavailable",
      };
    }
  }

  // ── 第二步：文件回退（preview → apply）───────────────────────────────────
  if (!wantsWorkspace) {
    // 纯会话回退：只返回规划结果，**不执行 fork**。
    return { scope: request.scope, conversation };
  }

  const workspace = await deps.planWorkspace();
  if (!workspace.available) {
    return {
      scope: request.scope,
      ...(conversation === undefined ? {} : { conversation }),
      workspace,
      unavailableReason: workspace.unavailableReason ?? "workspace rewind is unavailable",
    };
  }

  if (request.targetCheckpointId === undefined || request.targetCheckpointId.length === 0) {
    return {
      scope: request.scope,
      ...(conversation === undefined ? {} : { conversation }),
      workspace,
      unavailableReason: "targetCheckpointId is required for a workspace rewind",
    };
  }

  const applied = await deps.applyWorkspace(request.targetCheckpointId);
  return {
    scope: request.scope,
    ...(conversation === undefined ? {} : { conversation }),
    workspace,
    applied,
  };
}
