// SPDX-License-Identifier: Apache-2.0
// 准入状态机：回答"这条 workspace 声明现在能不能跑"。判定写成有序规则表 + 单一分派器，
// 刷新、修订校验、状态上报与遥测去重各自独立，避免把拒绝原因埋进嵌套分支。
import type {
  Logger,
  WorkspaceHookBundleSnapshot,
  WorkspaceHookReasonCode,
  WorkspaceHookSecurityRevision,
} from "@knorvia/contracts";
import {
  emitWorkspaceHookTelemetry,
  type WorkspaceHookTelemetryEvent,
  type WorkspaceHookTelemetryFields,
} from "./workspace-hook-telemetry.js";
import type { WorkspaceHookTrustCoordinator } from "./workspace-hook-trust-coordinator.js";
import type { WorkspaceHookSnapshotEvaluation } from "./workspace-hook-trust-types.js";
import type {
  WorkspaceHookActivationSource,
  WorkspaceHookAdmissionState,
  WorkspaceHookAdmissionStateCallback,
  WorkspaceHookDispatchDecision,
  WorkspaceHookDispatchInput,
  WorkspaceHookRuntimeAdmissionOptions,
  WorkspaceHookRuntimeAdmissionPort,
} from "./types.js";

export type {
  WorkspaceHookActivationSource,
  WorkspaceHookAdmissionState,
  WorkspaceHookAdmissionStateCallback,
  WorkspaceHookDispatchDecision,
  WorkspaceHookDispatchInput,
  WorkspaceHookRuntimeAdmissionOptions,
  WorkspaceHookRuntimeAdmissionPort,
} from "./types.js";

/** 拒绝结果的小构造器；统一形状便于规则表直接返回。 */
function reject(
  reasonCode: WorkspaceHookReasonCode,
  extra: { skipLifecycle?: boolean } = {},
): WorkspaceHookDispatchDecision {
  return { allowed: false, reasonCode, ...extra };
}

function abortableWait<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  signal.throwIfAborted();
  return new Promise<T>((accept, decline) => {
    const cancelled = () => {
      signal.removeEventListener("abort", cancelled);
      decline(signal.reason ?? new Error("Workspace Hook admission aborted"));
    };
    signal.addEventListener("abort", cancelled, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener("abort", cancelled);
        accept(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", cancelled);
        decline(error);
      },
    );
  });
}

interface SnapshotBook {
  snapshot: WorkspaceHookBundleSnapshot;
  digestOf: Map<string, string>;
}

function indexSnapshot(snapshot: WorkspaceHookBundleSnapshot): Map<string, string> {
  return new Map(snapshot.hooks.map((hook) => [hook.reviewItemId, hook.hookDeclarationDigest]));
}

/**
 * 准入状态机。三种"外部原因"（未激活、开关关闭、引导失败）与两种"声明原因"
 * （快照不匹配、未获授权）都只是规则表里的一行；命中即分派，且每条原因只透传一次遥测。
 */
export class WorkspaceHookRuntimeAdmission implements WorkspaceHookRuntimeAdmissionPort {
  private readonly coordinator: WorkspaceHookTrustCoordinator;
  private readonly enabled: boolean;
  private readonly logger?: Logger;
  private readonly readiness: Promise<void>;
  private readonly notifyAdmissionState?: WorkspaceHookAdmissionStateCallback;
  private readonly reportedTelemetry = new Set<string>();
  private book: SnapshotBook;
  private evaluation?: WorkspaceHookSnapshotEvaluation;
  private revisionSeen?: WorkspaceHookSecurityRevision;
  private blockedByInvalidation?: WorkspaceHookReasonCode;
  private state: "cold" | "ready" | "failed" = "cold";

  constructor(options: WorkspaceHookRuntimeAdmissionOptions) {
    this.coordinator = options.coordinator;
    this.enabled = options.enabled ?? true;
    this.logger = options.logger;
    this.readiness = options.ready;
    this.notifyAdmissionState = options.onAdmissionStateChanged;
    this.book = { digestOf: indexSnapshot(options.snapshot), snapshot: options.snapshot };
  }

  async activate(source: WorkspaceHookActivationSource, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const firstTime = this.state === "cold";

    if (!this.enabled) {
      if (firstTime) {
        this.state = "ready";
        this.reportOnce("workspace_hook.feature_disabled", {
          reasonCode: "workspace_hooks_feature_disabled",
          source,
          workspaceIdentity: this.book.snapshot.workspaceIdentity,
        });
        this.publishAdmissionState();
      }
      return;
    }

    if (firstTime) {
      let bootstrapFailed = false;
      try {
        await abortableWait(this.readiness, signal);
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        bootstrapFailed = true;
      }
      this.state = bootstrapFailed ? "failed" : "ready";
    }

    this.recompute({ safe: true });
    this.publishAdmissionState();
  }

  evaluateDispatch(input: WorkspaceHookDispatchInput): WorkspaceHookDispatchDecision {
    const snapshot = this.book.snapshot;
    const mismatch = (fields: WorkspaceHookTelemetryFields) => {
      this.reportOnce("workspace_hook.snapshot_mismatch", {
        reasonCode: "workspace_hooks_snapshot_mismatch",
        workspaceIdentity: snapshot.workspaceIdentity,
        ...fields,
      });
      return reject("workspace_hooks_snapshot_mismatch");
    };

    if (input.bundleDigest !== undefined && input.bundleDigest !== snapshot.bundleDigest)
      return mismatch({
        bundleDigest: input.bundleDigest,
        declarationDigest: input.hookDeclarationDigest,
      });
    if (this.book.digestOf.get(input.reviewItemId) !== input.hookDeclarationDigest)
      return mismatch({
        bundleDigest: snapshot.bundleDigest,
        declarationDigest: input.hookDeclarationDigest,
      });

    if (this.blockedByInvalidation !== undefined) return reject(this.blockedByInvalidation);
    if (this.state === "cold") return reject("workspace_hooks_pending_trust");
    if (!this.enabled) return reject("workspace_hooks_feature_disabled");
    if (this.state === "failed") {
      this.reportOnce("workspace_hook.trust_store_failure", {
        reasonCode: "workspace_hooks_trust_store_corrupt",
        workspaceIdentity: snapshot.workspaceIdentity,
      });
      return reject("workspace_hooks_trust_store_corrupt");
    }

    const revisionFresh =
      this.revisionSeen !== undefined &&
      this.coordinator.validateSecurityRevision(snapshot.workspaceIdentity, this.revisionSeen);
    if (!revisionFresh) {
      // 外部改过信任状态（例如设置页预授权）时会走到这里；刷新后必须重发状态，
      // pendingCount 为 0 也要发，用来清空提示条。
      this.recompute({ safe: false });
      this.publishAdmissionState();
    }

    const evaluated = this.evaluation?.items.find(
      (item) => item.reviewItemId === input.reviewItemId,
    );
    if (evaluated === undefined || evaluated.hookDeclarationDigest !== input.hookDeclarationDigest)
      return mismatch({
        bundleDigest: snapshot.bundleDigest,
        declarationDigest: input.hookDeclarationDigest,
      });
    if (evaluated.effectiveRunnable) return { allowed: true };

    const reasonCode = evaluated.reasonCode ?? "workspace_hooks_blocked_untrusted";
    if (reasonCode === "workspace_hooks_blocked_by_policy")
      this.reportOnce("workspace_hook.policy_blocked", {
        bundleDigest: snapshot.bundleDigest,
        declarationDigest: evaluated.hookDeclarationDigest,
        reasonCode,
        workspaceIdentity: snapshot.workspaceIdentity,
      });
    return reject(reasonCode, evaluated.configuredEnabled ? {} : { skipLifecycle: true });
  }

  getCurrentSnapshot(): WorkspaceHookBundleSnapshot {
    return this.book.snapshot;
  }

  /**
   * 跨 workspace 换快照属于调用方把边界搞混了：fail-loud，且不改任何状态。
   * 调用点必须先提交自己的写入，并在本地处理该异常，不能让它上升到 turn。
   */
  replaceSnapshot(snapshot: WorkspaceHookBundleSnapshot): void {
    if (snapshot.workspaceIdentity !== this.book.snapshot.workspaceIdentity)
      throw new Error("Cannot replace a Workspace Hook snapshot across workspace identities");

    this.book = { digestOf: indexSnapshot(snapshot), snapshot };
    this.forgetEvaluation();
    this.blockedByInvalidation = undefined;
    if (this.state !== "cold") {
      this.recompute({ safe: false });
      this.publishAdmissionState();
    }
  }

  invalidate(reasonCode: WorkspaceHookReasonCode): void {
    this.blockedByInvalidation = reasonCode;
    this.forgetEvaluation();
  }

  /** 评估结果与已校验修订必须一起失效；只清一个会留下不一致的判断依据。 */
  private forgetEvaluation(): void {
    this.evaluation = undefined;
    this.revisionSeen = undefined;
  }

  private recompute(input: { safe: boolean }): void {
    if (!this.enabled || this.state === "failed" || this.blockedByInvalidation !== undefined)
      return;
    try {
      const evaluation = this.coordinator.evaluateSnapshot({ snapshot: this.book.snapshot });
      this.evaluation = evaluation;
      this.revisionSeen = evaluation.securityRevision;
    } catch (error) {
      // 记录畸形时评估会抛错；不能让它冒泡出 activate（否则整个 turn 一起失败）：
      // 转成"引导失败"并保持 fail-closed。
      if (!input.safe) throw error;
      this.state = "failed";
      this.evaluation = undefined;
      this.revisionSeen = undefined;
    }
  }

  private publishAdmissionState(): void {
    if (!this.notifyAdmissionState) return;
    const pendingCount = this.evaluation
      ? this.evaluation.items.filter(
          (item) => item.configuredEnabled && item.admissionClass === "pending",
        ).length
      : 0;
    this.notifyAdmissionState({
      bundleDigest: this.book.snapshot.bundleDigest,
      pendingCount,
      ...(this.book.snapshot.workspaceIdentity
        ? { workspaceIdentity: this.book.snapshot.workspaceIdentity }
        : {}),
    });
  }

  private reportOnce(
    event: WorkspaceHookTelemetryEvent,
    fields: WorkspaceHookTelemetryFields,
  ): void {
    const fingerprint = [
      event,
      fields.reasonCode,
      fields.bundleDigest,
      fields.declarationDigest,
      fields.source,
    ].join("|");
    if (this.reportedTelemetry.has(fingerprint)) return;
    this.reportedTelemetry.add(fingerprint);
    const forward = emitWorkspaceHookTelemetry;
    forward(this.logger, event, fields);
  }
}

void (0 as unknown as WorkspaceHookRuntimeAdmissionPort);

export function createWorkspaceHookRuntimeAdmission(
  options: WorkspaceHookRuntimeAdmissionOptions,
): WorkspaceHookRuntimeAdmission {
  const admission = new WorkspaceHookRuntimeAdmission(options);
  return admission;
}
