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
  private readonly trust: WorkspaceHookTrustCoordinator;
  private readonly switchOn: boolean;
  private readonly sink?: Logger;
  private readonly readyWhen: Promise<void>;
  private readonly notify?: WorkspaceHookAdmissionStateCallback;
  private readonly reported = new Set<string>();
  private snapshotBook: SnapshotBook;
  private lastEvaluation?: WorkspaceHookSnapshotEvaluation;
  private lastRevision?: WorkspaceHookSecurityRevision;
  private invalidReason?: WorkspaceHookReasonCode;
  private phase: "cold" | "ready" | "failed" = "cold";

  constructor(settings: WorkspaceHookRuntimeAdmissionOptions) {
    this.trust = settings.coordinator;
    this.switchOn = settings.enabled ?? true;
    this.sink = settings.logger;
    this.readyWhen = settings.ready;
    this.notify = settings.onAdmissionStateChanged;
    this.snapshotBook = { digestOf: indexSnapshot(settings.snapshot), snapshot: settings.snapshot };
  }

  async activate(source: WorkspaceHookActivationSource, signal?: AbortSignal): Promise<void> {
    if (signal) signal.throwIfAborted();
    const firstRun = this.phase === "cold";

    const featureOff = !this.switchOn;
    if (featureOff) {
      if (firstRun) {
        this.phase = "ready";
        this.reportOnce(
          "workspace_hook.feature_disabled",
          Object.fromEntries([
            ["reasonCode", "workspace_hooks_feature_disabled"],
            ["source", source],
            ["workspaceIdentity", this.snapshotBook.snapshot.workspaceIdentity],
          ]),
        );
        this.publishAdmissionState();
      }
      return;
    }

    if (firstRun) {
      let bootstrapFailed = false;
      try {
        await abortableWait(this.readyWhen, signal);
      } catch (failure) {
        if (signal?.aborted) throw signal.reason ?? failure;
        bootstrapFailed = true;
      }
      this.phase = bootstrapFailed ? "failed" : "ready";
    }

    this.recompute({ safe: true });
    this.publishAdmissionState();
  }

  evaluateDispatch(input: WorkspaceHookDispatchInput): WorkspaceHookDispatchDecision {
    const snapshot = this.snapshotBook.snapshot;
    const mismatch = (fields: WorkspaceHookTelemetryFields) => {
      const entries: (readonly [string, unknown])[] = [
        ["reasonCode", "workspace_hooks_snapshot_mismatch"],
        ["workspaceIdentity", snapshot.workspaceIdentity],
      ];
      entries.push(...Object.entries(fields));
      this.reportOnce("workspace_hook.snapshot_mismatch", Object.fromEntries(entries));
      return reject("workspace_hooks_snapshot_mismatch");
    };

    if (input.bundleDigest !== undefined && input.bundleDigest !== snapshot.bundleDigest)
      return mismatch({
        bundleDigest: input.bundleDigest,
        declarationDigest: input.hookDeclarationDigest,
      });
    if (this.snapshotBook.digestOf.get(input.reviewItemId) !== input.hookDeclarationDigest)
      return mismatch({
        bundleDigest: snapshot.bundleDigest,
        declarationDigest: input.hookDeclarationDigest,
      });

    if (this.invalidReason !== undefined) return reject(this.invalidReason);
    if (this.phase === "cold") return reject("workspace_hooks_pending_trust");
    if (!this.switchOn) return reject("workspace_hooks_feature_disabled");
    if (this.phase === "failed") {
      this.reportOnce(
        "workspace_hook.trust_store_failure",
        Object.fromEntries([
          ["reasonCode", "workspace_hooks_trust_store_corrupt"],
          ["workspaceIdentity", snapshot.workspaceIdentity],
        ]),
      );
      return reject("workspace_hooks_trust_store_corrupt");
    }

    const revisionFresh =
      this.lastRevision !== undefined &&
      this.trust.validateSecurityRevision(snapshot.workspaceIdentity, this.lastRevision);
    if (!revisionFresh) {
      // 外部改过信任状态（例如设置页预授权）时会走到这里；刷新后必须重发状态，
      // pendingCount 为 0 也要发，用来清空提示条。
      this.recompute({ safe: false });
      this.publishAdmissionState();
    }

    const evaluated = this.lastEvaluation?.items.find(
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
      this.reportOnce(
        "workspace_hook.policy_blocked",
        Object.fromEntries([
          ["bundleDigest", snapshot.bundleDigest],
          ["declarationDigest", evaluated.hookDeclarationDigest],
          ["reasonCode", reasonCode],
          ["workspaceIdentity", snapshot.workspaceIdentity],
        ]),
      );
    return reject(reasonCode, evaluated.configuredEnabled ? {} : { skipLifecycle: true });
  }

  getCurrentSnapshot(): WorkspaceHookBundleSnapshot {
    return this.snapshotBook.snapshot;
  }

  /**
   * 跨 workspace 换快照属于调用方把边界搞混了：fail-loud，且不改任何状态。
   * 调用点必须先提交自己的写入，并在本地处理该异常，不能让它上升到 turn。
   */
  replaceSnapshot(snapshot: WorkspaceHookBundleSnapshot): void {
    if (snapshot.workspaceIdentity !== this.snapshotBook.snapshot.workspaceIdentity)
      throw new Error("Cannot replace a Workspace Hook snapshot across workspace identities");

    this.snapshotBook = { digestOf: indexSnapshot(snapshot), snapshot };
    this.forgetEvaluation();
    this.invalidReason = undefined;
    if (this.phase !== "cold") {
      this.recompute({ safe: false });
      this.publishAdmissionState();
    }
  }

  invalidate(reasonCode: WorkspaceHookReasonCode): void {
    this.invalidReason = reasonCode;
    this.forgetEvaluation();
  }

  /** 评估结果与已校验修订必须一起失效；只清一个会留下不一致的判断依据。 */
  private forgetEvaluation(): void {
    this.lastEvaluation = undefined;
    this.lastRevision = undefined;
  }

  private recompute(input: { safe: boolean }): void {
    if (!this.switchOn || this.phase === "failed" || this.invalidReason !== undefined) return;
    try {
      const evaluation = this.trust.evaluateSnapshot({ snapshot: this.snapshotBook.snapshot });
      this.lastEvaluation = evaluation;
      this.lastRevision = evaluation.securityRevision;
    } catch (error) {
      // 记录畸形时评估会抛错；不能让它冒泡出 activate（否则整个 turn 一起失败）：
      // 转成"引导失败"并保持 fail-closed。
      if (!input.safe) throw error;
      this.phase = "failed";
      this.lastEvaluation = undefined;
      this.lastRevision = undefined;
    }
  }

  private publishAdmissionState(): void {
    if (!this.notify) return;
    const pendingCount = this.lastEvaluation
      ? this.lastEvaluation.items.filter(
          (item) => item.configuredEnabled && item.admissionClass === "pending",
        ).length
      : 0;
    this.notify({
      bundleDigest: this.snapshotBook.snapshot.bundleDigest,
      pendingCount,
      ...(this.snapshotBook.snapshot.workspaceIdentity
        ? { workspaceIdentity: this.snapshotBook.snapshot.workspaceIdentity }
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
    if (this.reported.has(fingerprint)) return;
    this.reported.add(fingerprint);
    const forward = emitWorkspaceHookTelemetry;
    forward(this.sink, event, fields);
  }
}

void (0 as unknown as WorkspaceHookRuntimeAdmissionPort);

export function createWorkspaceHookRuntimeAdmission(
  options: WorkspaceHookRuntimeAdmissionOptions,
): WorkspaceHookRuntimeAdmission {
  const admission = new WorkspaceHookRuntimeAdmission(options);
  return admission;
}
