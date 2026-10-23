// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：DSH 插件入口（文件回退与工作区检查点）。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{README,interface,behavior}.md
//           §一 / §1.2-1.3 / B1 / B9 / B10 / B12
//
// 挂载形态（照 kernel-plugin-policy 的模板）：`apply(ctx, config)` 接收两个端口，
// 返回一个 handle 暴露回退能力；不 import 任何 DSH 运行时（L1），保持 engine-agnostic（L9）。
//
// **引擎无关**：本包不读 `KNORVIA_KERNEL_ENGINE`。
// 分流在进程级入口 `apps/cli/packages/cli/src/run.ts:255`，legacy 路径不加载本模块。
//
// **L5 硬边界**：本包**只规划**会话回退（产出 targetSequenceNumber），
// **不执行 `session.fork`** —— 那归 kernel-bridge / kernel-legacy-sessions。

import type { Context } from "@deepseek-ai/cordis";
import {
  createSessionId,
  type FileSystemPort,
  type SessionEventStorePort,
  type ToolArtifactStorePort,
} from "@knorvia/contracts";
import { NOOP_LOGGER, type KnorviaLogger } from "./logger.js";
import { readFileState } from "./file-state.js";
import { planFileRewindWithPort, unavailablePlan, type RewindPlan } from "./file-rewind-plan.js";
import {
  applyFileRewind,
  createInFlightRegistry,
  type RewindApplyResult,
} from "./file-rewind-apply.js";
import { collectCheckpoints, type CheckpointSummary } from "./checkpoint-events.js";
import { findCheckpointEvent, listCheckpoints } from "./checkpoint-list.js";
import { readCheckpointFiles, ARTIFACT_STORE_UNCONFIGURED } from "./checkpoint-artifact.js";
import { planConversationRewind, type ConversationPlan } from "./conversation-plan.js";
import { executeRewind, type RewindOutcome, type RewindRequest } from "./rewind-router.js";
import {
  REWIND_TOOL_DECLARATIONS,
  describeRewindTools,
  type RewindToolDeclaration,
} from "./tool-declarations.js";

/** 组合行 id。由 kernel-switch 写入 `composition.ts`（本包不改冻结面）。 */
export const DEFAULT_REWIND_ROW_ID = "knorvia-rewind";

/** 路径模块的最小形状（注入便于测试跨平台）。 */
export interface PathModule {
  readonly isAbsolute: (path: string) => boolean;
  readonly resolve: (...segments: string[]) => string;
}

/** 插件配置。三个必需项缺席 → `apply` 立即抛错（B1）。 */
export interface KnorviaRewindConfig {
  /** 文件系统端口。**必需**（K1：不用 node:fs 兜底）。 */
  readonly fileSystem: FileSystemPort;
  /** 会话事件存储端口。**必需**。 */
  readonly eventStore: SessionEventStorePort;
  /** 工作区根目录（绝对路径）。**必需**（K2）。 */
  readonly workspaceRoot: string;
  /**
   * artifact 存储端口。**可选**（K10 / interface.md §2.3）。
   *
   * 只有 `previewFileRewind` / `applyFileRewind` 需要它（要读检查点的文件清单）；
   * `listCheckpoints` / `planConversationRewind` 不需要（只读事件）。
   * 缺失时「读文件清单」的能力返回明确不可用（B9），**不是装配期抛错**。
   */
  readonly artifactStore?: ToolArtifactStorePort;
  /** 注入 path 实现（测试用；生产用 `node:path`）。 */
  readonly pathModule?: PathModule;
  /** 注入 id 生成（测试用）。 */
  readonly newId?: () => string;
  readonly logger?: KnorviaLogger;
}

/** 插件 handle：暴露回退能力。 */
export interface RewindPluginHandle {
  readonly rowId: string;
  previewFileRewind(options: {
    targetCheckpointId?: string;
    sessionId: string;
  }): Promise<RewindPlan>;
  applyFileRewind(options: {
    targetCheckpointId: string;
    sessionId: string;
  }): Promise<RewindApplyResult>;
  listCheckpoints(options: {
    sessionId: string;
    limit?: number;
  }): Promise<readonly CheckpointSummary[]>;
  planConversationRewind(options: {
    sessionId: string;
    targetMessageId: string;
  }): Promise<ConversationPlan>;
  executeRewind(options: { sessionId: string; request: RewindRequest }): Promise<RewindOutcome>;
  /** 工具声明（供 policy 的 `readToolCapability` 接线）。 */
  readonly toolDeclarations: ReadonlyMap<string, RewindToolDeclaration>;
}

/**
 * DSH 插件入口。
 *
 * @throws 缺少必需接线字段时**立即抛错**（早失败，不拖到第一次回退）。
 */
export function apply(ctx: Context, config: KnorviaRewindConfig): RewindPluginHandle {
  const logger = config.logger ?? NOOP_LOGGER;

  // 早失败（B1）：三个必需项都是「当前运行时的事实」，不补默认值。
  assertWired(config);

  const { fileSystem, eventStore, workspaceRoot } = config;
  const pathModule = config.pathModule;
  const newId = config.newId ?? (() => `rewind_${Math.random().toString(36).slice(2, 12)}`);
  const inFlight = createInFlightRegistry();

  /** 相对路径 → 绝对路径。本模块唯一做路径组合的地方（L10）。 */
  const resolvePath = (relativePath: string): string => {
    // 端口要求绝对路径；`pathModule` 缺省时原样传 ——
    // 但那样会在真实端口上失败，所以生产必须注入（K2/接缝）。
    if (pathModule === undefined) return relativePath;
    return pathModule.isAbsolute(relativePath)
      ? relativePath
      : pathModule.resolve(workspaceRoot, relativePath);
  };

  logger.info("kernel.rewind.mounted", {
    rowId: DEFAULT_REWIND_ROW_ID,
    workspaceRoot,
    toolCount: REWIND_TOOL_DECLARATIONS.length,
    hasPathModule: pathModule !== undefined,
  });

  /** 读某会话的全部事件。 */
  const readEvents = async (sessionId: string) => eventStore.getEvents(createSessionId(sessionId));

  /** 找检查点并算计划（preview 的公共部分）。 */
  const buildPlan = async (sessionId: string, targetCheckpointId?: string): Promise<RewindPlan> => {
    const events = await readEvents(sessionId);
    const checkpoints = collectCheckpoints(events);
    if (checkpoints.length === 0) {
      return unavailablePlan("no workspace checkpoint is available yet");
    }

    // 未指定检查点 → 用最新的那个（对应 `/rewind latest` 的语义）。
    const chosen =
      targetCheckpointId === undefined
        ? checkpoints[0]
        : checkpoints.find((item) => item.checkpointId === targetCheckpointId);
    if (chosen === undefined) {
      return unavailablePlan(`checkpoint ${String(targetCheckpointId)} not found`);
    }

    const event = findCheckpointEvent(events, chosen.checkpointId);
    if (event === undefined) {
      return unavailablePlan(`checkpoint ${chosen.checkpointId} has no event`);
    }

    // K10：文件清单来自 artifactStore（`snapshotRef` 是 URI 引用），不在事件 payload 里。
    const filesOutcome = await readCheckpointFiles(config.artifactStore, chosen.snapshotRef);
    if (filesOutcome.kind !== "loaded") {
      // 明确不可用（B9），不当成「无需回退」。
      const detail =
        filesOutcome.kind === "unconfigured" ? ARTIFACT_STORE_UNCONFIGURED : filesOutcome.detail;
      return unavailablePlan(`checkpoint ${chosen.checkpointId} is unreadable: ${detail}`);
    }

    return planFileRewindWithPort(fileSystem, chosen.checkpointId, filesOutcome.files, resolvePath);
  };

  /** 空结果（不可用时的 apply 返回）。 */
  const emptyApplyResult = (reason: string): RewindApplyResult => ({
    scope: "workspace",
    rewindId: newId(),
    applied: 0,
    skipped: 0,
    failures: [],
    partial: false,
    unavailableReason: reason,
  });

  const handle: RewindPluginHandle = {
    rowId: DEFAULT_REWIND_ROW_ID,
    toolDeclarations: describeRewindTools(),

    async previewFileRewind(options) {
      const plan = await buildPlan(options.sessionId, options.targetCheckpointId);
      logger.debug("kernel.rewind.preview", {
        sessionId: options.sessionId,
        checkpointId: plan.checkpointId,
        operationCount: plan.operations.length,
        available: plan.available,
      });
      return plan;
    },

    async applyFileRewind(options) {
      // 先算计划（含漂移校验所需的 expectedHash），再执行。
      const plan = await buildPlan(options.sessionId, options.targetCheckpointId);
      if (!plan.available) {
        return emptyApplyResult(plan.unavailableReason ?? "workspace rewind is unavailable");
      }

      const result = await applyFileRewind(
        plan.checkpointId ?? options.targetCheckpointId,
        plan.operations,
        { fileSystem, resolvePath, newRewindId: newId },
        inFlight,
      );

      logger.info("kernel.rewind.applied", {
        sessionId: options.sessionId,
        rewindId: result.rewindId,
        applied: result.applied,
        skipped: result.skipped,
        partial: result.partial,
      });
      if (result.partial) {
        logger.warn("kernel.rewind.partial", {
          sessionId: options.sessionId,
          rewindId: result.rewindId,
          failureCount: result.failures.length,
        });
      }
      return result;
    },

    async listCheckpoints(options) {
      return listCheckpoints(eventStore, options.sessionId, options.limit);
    },

    async planConversationRewind(options) {
      const events = await readEvents(options.sessionId);
      return planConversationRewind(events, options.targetMessageId);
    },

    async executeRewind(options) {
      return executeRewind(options.request, {
        planWorkspace: () => buildPlan(options.sessionId, options.request.targetCheckpointId),
        applyWorkspace: async (checkpointId) => {
          const plan = await buildPlan(options.sessionId, checkpointId);
          if (!plan.available) {
            return emptyApplyResult(plan.unavailableReason ?? "workspace rewind is unavailable");
          }
          return applyFileRewind(
            checkpointId,
            plan.operations,
            { fileSystem, resolvePath, newRewindId: newId },
            inFlight,
          );
        },
        readEvents: () => readEvents(options.sessionId),
      });
    },
  };

  void ctx;
  void readFileState;
  return handle;
}

/**
 * 装配期校验（B1）：三个必需项缺席即抛错。
 *
 * **不补默认值** —— 用 `node:fs` 兜底会违反 AGENTS.md 的 I/O 收敛要求（L1/K1）；
 * 用 `process.cwd()` 兜底 `workspaceRoot` 会让「回退哪个工作区」在运行期漂移（K2）。
 */
export function assertWired(config: KnorviaRewindConfig): void {
  if (config.fileSystem === undefined || config.fileSystem === null) {
    throw new Error(
      "kernel-plugin-rewind: config.fileSystem is required " +
        "(the composition root must inject the FileSystemPort implementation)",
    );
  }
  if (config.eventStore === undefined || config.eventStore === null) {
    throw new Error(
      "kernel-plugin-rewind: config.eventStore is required " +
        "(the composition root must inject the SessionEventStorePort implementation)",
    );
  }
  if (typeof config.workspaceRoot !== "string" || config.workspaceRoot.length === 0) {
    throw new Error(
      "kernel-plugin-rewind: config.workspaceRoot is required " +
        "(relative rewind targets resolve against it; do not fall back to process.cwd())",
    );
  }
}

export { NOOP_LOGGER } from "./logger.js";
export { contentHash, readFileState, ABSENT_HASH } from "./file-state.js";
export { planFileRewind, planFileRewindWithPort, unavailablePlan } from "./file-rewind-plan.js";
export { applyFileRewind, createInFlightRegistry } from "./file-rewind-apply.js";
export { compensateRewind } from "./file-rewind-compensate.js";
export {
  appendCheckpointEvent,
  appendRewindEvent,
  collectCheckpoints,
  parseCheckpointEvent,
  isWorkspaceFileRewindEvent,
  validatePersistedEvent,
} from "./checkpoint-events.js";
export { listCheckpoints, loadCheckpointFiles, findCheckpointEvent } from "./checkpoint-list.js";
export {
  planConversationRewind,
  unavailableConversationPlan,
  REWIND_SCOPE,
  TARGET_STATUS,
} from "./conversation-plan.js";
export { executeRewind } from "./rewind-router.js";
export {
  REWIND_TOOL_DECLARATIONS,
  PREVIEW_TOOL_NAME,
  APPLY_TOOL_NAME,
  describeRewindTools,
} from "./tool-declarations.js";

export type { KnorviaLogger } from "./logger.js";
export type { FileState, FileReadFailure, FileStateReadResult } from "./file-state.js";
export type { RewindOperation, RewindPlan, CheckpointFileEntry } from "./file-rewind-plan.js";
export type {
  RewindApplyResult,
  ApplyDependencies,
  InFlightRegistry,
} from "./file-rewind-apply.js";
export type { RewindJournalEntry, CompensationResult } from "./file-rewind-compensate.js";
export type { CheckpointSummary } from "./checkpoint-events.js";
export type { ConversationPlan, RewindScope, TargetStatus } from "./conversation-plan.js";
export type { RewindOutcome, RewindRequest, RewindRouterDeps } from "./rewind-router.js";
export type { RewindToolDeclaration } from "./tool-declarations.js";
