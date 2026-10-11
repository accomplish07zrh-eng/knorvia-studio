// SPDX-License-Identifier: Apache-2.0
// 运行时准入：把信任求值结果变成每个 workspace Hook 的"能不能跑"，并承担
// 评估刷新、修订校验、admission 状态上报与受限遥测去重。
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

export type WorkspaceHookActivationSource = "startup" | "resume" | "clear" | "compact";

export interface WorkspaceHookDispatchInput {
  /** 持有 bundle 目标的调用方用它做一致性断言；运行时登记项不传。 */
  bundleDigest?: string;
  hookDeclarationDigest: string;
  reviewItemId: string;
}

export type WorkspaceHookDispatchDecision =
  | { allowed: true }
  | { allowed: false; reasonCode: WorkspaceHookReasonCode; skipLifecycle?: boolean };

export interface WorkspaceHookAdmissionState {
  pendingCount: number;
  bundleDigest: string;
  workspaceIdentity?: string;
}

export type WorkspaceHookAdmissionStateCallback = (state: WorkspaceHookAdmissionState) => void;

export interface WorkspaceHookRuntimeAdmissionPort {
  activate(source: WorkspaceHookActivationSource, signal?: AbortSignal): Promise<void>;
  evaluateDispatch(input: WorkspaceHookDispatchInput): WorkspaceHookDispatchDecision;
  getCurrentSnapshot(): WorkspaceHookBundleSnapshot;
  replaceSnapshot(snapshot: WorkspaceHookBundleSnapshot): void;
  invalidate(reasonCode: WorkspaceHookReasonCode): void;
}

export interface WorkspaceHookRuntimeAdmissionOptions {
  coordinator: WorkspaceHookTrustCoordinator;
  enabled?: boolean;
  logger?: Logger;
  ready: Promise<void>;
  onAdmissionStateChanged?: WorkspaceHookAdmissionStateCallback;
  snapshot: WorkspaceHookBundleSnapshot;
}

function waitForAdmission<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new Error("Workspace Hook admission aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * 准入状态机。所有拒绝路径都先给出精确 reasonCode 再上报遥测；
 * 遥测按 `event:reasonCode:bundleDigest:declarationDigest:source` 去重，避免每个回合重复刷日志。
 */
export class WorkspaceHookRuntimeAdmission implements WorkspaceHookRuntimeAdmissionPort {
  private readonly coordinator: WorkspaceHookTrustCoordinator;
  private readonly enabled: boolean;
  private readonly logger?: Logger;
  private readonly ready: Promise<void>;
  private readonly onAdmissionStateChanged?: WorkspaceHookAdmissionStateCallback;
  private readonly digestByReviewItemId = new Map<string, string>();
  private readonly emittedTelemetry = new Set<string>();

  private snapshot: WorkspaceHookBundleSnapshot;
  private evaluation?: WorkspaceHookSnapshotEvaluation;
  private validatedRevision?: WorkspaceHookSecurityRevision;
  private invalidatedReason?: WorkspaceHookReasonCode;
  private activated = false;
  private bootstrapFailed = false;

  constructor(options: WorkspaceHookRuntimeAdmissionOptions) {
    this.coordinator = options.coordinator;
    this.enabled = options.enabled ?? true;
    this.logger = options.logger;
    this.ready = options.ready;
    this.onAdmissionStateChanged = options.onAdmissionStateChanged;
    this.snapshot = options.snapshot;
    this.indexSnapshot(options.snapshot);
  }

  async activate(source: WorkspaceHookActivationSource, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();

    if (!this.enabled) {
      if (!this.activated) {
        this.activated = true;
        this.telemetryOnce("workspace_hook.feature_disabled", {
          reasonCode: "workspace_hooks_feature_disabled",
          source,
          workspaceIdentity: this.snapshot.workspaceIdentity,
        });
        this.emitAdmissionState();
      }
      return;
    }

    if (!this.activated) {
      try {
        await waitForAdmission(this.ready, signal);
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        // Trust store 引导失败不扩大执行面：置失败标志，主任务与其他来源 Hook 继续。
        this.bootstrapFailed = true;
      }
      this.activated = true;
    }

    this.refreshEvaluationSafely();
    this.emitAdmissionState();
  }

  evaluateDispatch(input: WorkspaceHookDispatchInput): WorkspaceHookDispatchDecision {
    if (!this.matchesSnapshot(input)) {
      this.telemetryOnce("workspace_hook.snapshot_mismatch", {
        bundleDigest: input.bundleDigest,
        declarationDigest: input.hookDeclarationDigest,
        reasonCode: "workspace_hooks_snapshot_mismatch",
        workspaceIdentity: this.snapshot.workspaceIdentity,
      });
      return { allowed: false, reasonCode: "workspace_hooks_snapshot_mismatch" };
    }
    if (this.invalidatedReason) return { allowed: false, reasonCode: this.invalidatedReason };
    if (!this.activated) return { allowed: false, reasonCode: "workspace_hooks_pending_trust" };
    if (!this.enabled) return { allowed: false, reasonCode: "workspace_hooks_feature_disabled" };
    if (this.bootstrapFailed) {
      this.telemetryOnce("workspace_hook.trust_store_failure", {
        reasonCode: "workspace_hooks_trust_store_corrupt",
        workspaceIdentity: this.snapshot.workspaceIdentity,
      });
      return { allowed: false, reasonCode: "workspace_hooks_trust_store_corrupt" };
    }

    if (
      !this.validatedRevision ||
      !this.coordinator.validateSecurityRevision(this.snapshot.workspaceIdentity, this.validatedRevision)
    ) {
      // 外部写入 Trust store（如设置页预授权）会 bump 修订，这里懒刷新并重发状态，
      // pendingCount 为 0 也要发，用于清空提示条。
      this.refreshEvaluation();
      this.emitAdmissionState();
    }

    const item = this.evaluation?.items.find(
      (candidate) => candidate.reviewItemId === input.reviewItemId,
    );
    if (!item || item.hookDeclarationDigest !== input.hookDeclarationDigest) {
      this.telemetryOnce("workspace_hook.snapshot_mismatch", {
        bundleDigest: this.snapshot.bundleDigest,
        declarationDigest: input.hookDeclarationDigest,
        reasonCode: "workspace_hooks_snapshot_mismatch",
        workspaceIdentity: this.snapshot.workspaceIdentity,
      });
      return { allowed: false, reasonCode: "workspace_hooks_snapshot_mismatch" };
    }
    if (item.effectiveRunnable) return { allowed: true };

    const reasonCode = item.reasonCode ?? "workspace_hooks_blocked_untrusted";
    if (reasonCode === "workspace_hooks_blocked_by_policy")
      this.telemetryOnce("workspace_hook.policy_blocked", {
        bundleDigest: this.snapshot.bundleDigest,
        declarationDigest: item.hookDeclarationDigest,
        reasonCode,
        workspaceIdentity: this.snapshot.workspaceIdentity,
      });

    return {
      allowed: false,
      reasonCode,
      ...(item.configuredEnabled ? {} : { skipLifecycle: true }),
    };
  }

  getCurrentSnapshot(): WorkspaceHookBundleSnapshot {
    return this.snapshot;
  }

  /**
   * 跨 workspaceIdentity 替换是调用方编程错误（混淆了 workspace 边界）：fail-loud 且不改状态。
   * 调用方需先提交自身写入，并在调用点处理该异常，不能让它冒泡到 turn 级别。
   */
  replaceSnapshot(snapshot: WorkspaceHookBundleSnapshot): void {
    if (snapshot.workspaceIdentity !== this.snapshot.workspaceIdentity)
      throw new Error("Cannot replace a Workspace Hook snapshot across workspace identities");

    this.snapshot = snapshot;
    this.digestByReviewItemId.clear();
    this.indexSnapshot(snapshot);
    this.evaluation = undefined;
    this.validatedRevision = undefined;
    this.invalidatedReason = undefined;
    if (this.activated) {
      this.refreshEvaluation();
      this.emitAdmissionState();
    }
  }

  invalidate(reasonCode: WorkspaceHookReasonCode): void {
    this.invalidatedReason = reasonCode;
    this.evaluation = undefined;
    this.validatedRevision = undefined;
  }

  private indexSnapshot(snapshot: WorkspaceHookBundleSnapshot): void {
    for (const entry of snapshot.hooks)
      this.digestByReviewItemId.set(entry.reviewItemId, entry.hookDeclarationDigest);
  }

  private matchesSnapshot(input: WorkspaceHookDispatchInput): boolean {
    return (
      (input.bundleDigest === undefined || input.bundleDigest === this.snapshot.bundleDigest) &&
      this.digestByReviewItemId.get(input.reviewItemId) === input.hookDeclarationDigest
    );
  }

  private emitAdmissionState(): void {
    if (!this.onAdmissionStateChanged) return;
    const pendingCount = this.evaluation
      ? this.evaluation.items.filter(
          (item) => item.configuredEnabled && item.admissionClass === "pending",
        ).length
      : 0;
    this.onAdmissionStateChanged({
      bundleDigest: this.snapshot.bundleDigest,
      pendingCount,
      ...(this.snapshot.workspaceIdentity
        ? { workspaceIdentity: this.snapshot.workspaceIdentity }
        : {}),
    });
  }

  private telemetryOnce(
    event: WorkspaceHookTelemetryEvent,
    fields: WorkspaceHookTelemetryFields,
  ): void {
    const key = [
      event,
      fields.reasonCode,
      fields.bundleDigest,
      fields.declarationDigest,
      fields.source,
    ].join(":");
    if (this.emittedTelemetry.has(key)) return;
    this.emittedTelemetry.add(key);
    emitWorkspaceHookTelemetry(this.logger, event, fields);
  }

  private refreshEvaluation(): void {
    if (!this.enabled || this.bootstrapFailed || this.invalidatedReason) return;
    const evaluation = this.coordinator.evaluateSnapshot({ snapshot: this.snapshot });
    this.evaluation = evaluation;
    this.validatedRevision = { ...evaluation.securityRevision };
  }

  /**
   * `evaluateSnapshot` 在持久记录畸形时会抛错。该异常不得冒泡出 activate
   * （否则整个 turn 与其他来源 Hook 一并失败）：捕获后置 bootstrapFailed，
   * 之后 evaluateDispatch 一律按 trust_store_corrupt 拒绝（fail-closed）。
   */
  private refreshEvaluationSafely(): void {
    if (!this.enabled || this.bootstrapFailed || this.invalidatedReason) return;
    try {
      this.refreshEvaluation();
    } catch {
      this.bootstrapFailed = true;
      this.evaluation = undefined;
      this.validatedRevision = undefined;
    }
  }
}

export function createWorkspaceHookRuntimeAdmission(
  options: WorkspaceHookRuntimeAdmissionOptions,
): WorkspaceHookRuntimeAdmission {
  return new WorkspaceHookRuntimeAdmission(options);
}
