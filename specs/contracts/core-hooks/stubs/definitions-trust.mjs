// SPDX-License-Identifier: Apache-2.0
// core-hooks 桩：workspace Hook 信任/审核/准入/遥测组（构建器见 build-stubs.mjs）。
import { header, imports, NOT_IMPLEMENTED } from "./shared.mjs";

export const trustStubs = {
  "workspace-hook-policy.ts": `${header("workspace-hook-policy.ts")}${imports(["WorkspaceHookPolicy"])}
export interface WorkspaceHookPolicyChange { workspaceIdentity?: string; policy: WorkspaceHookPolicy }
export interface WorkspaceHookPolicyProvider {
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy;
  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void;
}
export class InMemoryWorkspaceHookPolicyProvider implements WorkspaceHookPolicyProvider {
  constructor(defaultPolicy?: WorkspaceHookPolicy) {
    void defaultPolicy;
    ${NOT_IMPLEMENTED}
  }
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy {
    void workspaceIdentity;
    ${NOT_IMPLEMENTED}
  }
  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void {
    void listener;
    ${NOT_IMPLEMENTED}
  }
  setWorkspacePolicy(workspaceIdentity: string, policy: WorkspaceHookPolicy): void {
    void workspaceIdentity;
    void policy;
    ${NOT_IMPLEMENTED}
  }
  clearWorkspacePolicy(workspaceIdentity: string): void {
    void workspaceIdentity;
    ${NOT_IMPLEMENTED}
  }
  setDefaultPolicy(policy: WorkspaceHookPolicy): void {
    void policy;
    ${NOT_IMPLEMENTED}
  }
}
`,

  "workspace-hook-review-flow.ts": `${header("workspace-hook-review-flow.ts")}${imports([
    "WorkspaceHookReasonCode",
    "WorkspaceHookReviewFlowState",
  ])}
import type {
  WorkspaceHookReviewDecision,
  WorkspaceHookReviewRequestPayload,
} from "@knorvia/shared/protocol-v4";
export interface WorkspaceHookReviewTarget {
  sessionId: string;
  taskId: string;
  runId: string;
  remoteSessionId?: string;
  workspaceIdentity: string;
  bundleDigest: string;
  reviewFlowId: string;
  generation: number;
  interactionId: string;
}
export interface WorkspaceHookReviewOutcome {
  action: "trust_selected" | "no_change";
  reviewItemIds: string[];
  reasonCode: WorkspaceHookReasonCode | undefined;
}
export type WorkspaceHookReviewResolveResult =
  | { accepted: true; reviewItemIds: string[] }
  | { accepted: false; reasonCode: "workspace_hooks_review_superseded" | "workspace_hooks_snapshot_mismatch" };
export interface WorkspaceHookReviewFlow {
  readonly request: WorkspaceHookReviewRequestPayload;
  readonly result: Promise<WorkspaceHookReviewOutcome>;
  readonly state: WorkspaceHookReviewFlowState;
}
export class WorkspaceHookReviewFlowRegistry {
  open(value: WorkspaceHookReviewRequestPayload): WorkspaceHookReviewFlow {
    void value;
    ${NOT_IMPLEMENTED}
  }
  supersede(target: WorkspaceHookReviewTarget, replacement: WorkspaceHookReviewRequestPayload): WorkspaceHookReviewFlow {
    void target;
    void replacement;
    ${NOT_IMPLEMENTED}
  }
  validate(target: WorkspaceHookReviewTarget, decisionValue: WorkspaceHookReviewDecision): WorkspaceHookReviewResolveResult {
    void target;
    void decisionValue;
    ${NOT_IMPLEMENTED}
  }
  resolve(target: WorkspaceHookReviewTarget, decisionValue: WorkspaceHookReviewDecision): WorkspaceHookReviewResolveResult {
    void target;
    void decisionValue;
    ${NOT_IMPLEMENTED}
  }
  fail(target: WorkspaceHookReviewTarget, reasonCode: WorkspaceHookReasonCode): boolean {
    void target;
    void reasonCode;
    ${NOT_IMPLEMENTED}
  }
  closeWithoutDecision(target: WorkspaceHookReviewTarget): boolean {
    void target;
    ${NOT_IMPLEMENTED}
  }
  getCurrentFlow(sessionId: string): WorkspaceHookReviewFlow | undefined {
    void sessionId;
    ${NOT_IMPLEMENTED}
  }
  getCurrent(sessionId: string): WorkspaceHookReviewFlowState | undefined {
    void sessionId;
    ${NOT_IMPLEMENTED}
  }
}
`,

  "workspace-hook-runtime-admission.ts": `${header("workspace-hook-runtime-admission.ts")}${imports(
    ["Logger", "WorkspaceHookBundleSnapshot", "WorkspaceHookReasonCode"],
  )}
import type { WorkspaceHookTrustCoordinator } from "./workspace-hook-trust-coordinator.js";
export type WorkspaceHookActivationSource = "startup" | "resume" | "clear" | "compact";
export interface WorkspaceHookDispatchInput {
  bundleDigest?: string;
  hookDeclarationDigest: string;
  reviewItemId: string;
}
export type WorkspaceHookDispatchDecision =
  | { allowed: true }
  | { allowed: false; reasonCode: WorkspaceHookReasonCode; skipLifecycle?: boolean };
export interface WorkspaceHookAdmissionState { pendingCount: number; bundleDigest: string; workspaceIdentity?: string }
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
export class WorkspaceHookRuntimeAdmission implements WorkspaceHookRuntimeAdmissionPort {
  constructor(options: WorkspaceHookRuntimeAdmissionOptions) {
    void options;
    ${NOT_IMPLEMENTED}
  }
  activate(source: WorkspaceHookActivationSource, signal?: AbortSignal): Promise<void> {
    void source;
    void signal;
    ${NOT_IMPLEMENTED}
  }
  evaluateDispatch(input: WorkspaceHookDispatchInput): WorkspaceHookDispatchDecision {
    void input;
    ${NOT_IMPLEMENTED}
  }
  getCurrentSnapshot(): WorkspaceHookBundleSnapshot {
    ${NOT_IMPLEMENTED}
  }
  replaceSnapshot(snapshot: WorkspaceHookBundleSnapshot): void {
    void snapshot;
    ${NOT_IMPLEMENTED}
  }
  invalidate(reasonCode: WorkspaceHookReasonCode): void {
    void reasonCode;
    ${NOT_IMPLEMENTED}
  }
}
export function createWorkspaceHookRuntimeAdmission(
  options: WorkspaceHookRuntimeAdmissionOptions,
): WorkspaceHookRuntimeAdmission {
  void options;
  ${NOT_IMPLEMENTED}
}
`,

  "workspace-hook-telemetry.ts": `${header("workspace-hook-telemetry.ts")}${imports([
    "Logger",
    "WorkspaceHookReasonCode",
  ])}
export type WorkspaceHookTelemetryEvent =
  | "workspace_hook.feature_disabled" | "workspace_hook.review_request_created"
  | "workspace_hook.trust_selected" | "workspace_hook.review_timeout"
  | "workspace_hook.review_superseded" | "workspace_hook.snapshot_mismatch"
  | "workspace_hook.policy_blocked" | "workspace_hook.trust_store_failure"
  | "workspace_hook.toggle_failure" | "workspace_hook.config_rebuild_failure"
  | "workspace_hook.revoked" | "workspace_hook.stale_response";
export interface WorkspaceHookTelemetryFields {
  workspaceIdentity?: string;
  bundleDigest?: string;
  declarationDigest?: string;
  reasonCode?: WorkspaceHookReasonCode;
  source?: string;
  action?: string;
  generation?: number;
  errorMessage?: string;
  requestItemCount?: number;
  requestEnabledCount?: number;
  grantedRecordCount?: number;
  revokedCount?: number;
}
export function emitWorkspaceHookTelemetry(
  logger: Logger | undefined,
  event: WorkspaceHookTelemetryEvent,
  fields?: WorkspaceHookTelemetryFields,
): void {
  void logger;
  void event;
  void fields;
  ${NOT_IMPLEMENTED}
}
export function digestSummary(value: string): string {
  void value;
  ${NOT_IMPLEMENTED}
}
export function workspaceIdentitySummary(value: string): string {
  void value;
  ${NOT_IMPLEMENTED}
}
`,

  "workspace-hook-trust-coordinator.ts": `${header("workspace-hook-trust-coordinator.ts")}${imports(
    [
      "WorkspaceHookBundleSnapshot",
      "WorkspaceHookPolicy",
      "WorkspaceHookSecurityRevision",
      "WorkspaceHookTrustRecord",
    ],
  )}
import type { WorkspaceHookPolicyProvider } from "./workspace-hook-policy.js";
import type {
  WorkspaceHookSnapshotEvaluation,
  WorkspaceHookTrustStoreState,
} from "./workspace-hook-trust-types.js";
export interface WorkspaceHookTrustCoordinatorOptions {
  coordinatorEpoch: string;
  policyProvider?: WorkspaceHookPolicyProvider;
}
export class WorkspaceHookTrustCoordinator {
  constructor(options: WorkspaceHookTrustCoordinatorOptions) {
    void options;
    ${NOT_IMPLEMENTED}
  }
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy {
    void workspaceIdentity;
    ${NOT_IMPLEMENTED}
  }
  assertPersistentTrustMutationAllowed(workspaceIdentity: string): void {
    void workspaceIdentity;
    ${NOT_IMPLEMENTED}
  }
  canMutatePersistentTrust(workspaceIdentity: string): boolean {
    void workspaceIdentity;
    ${NOT_IMPLEMENTED}
  }
  replacePersistentTrustRecords(records: readonly WorkspaceHookTrustRecord[], state: WorkspaceHookTrustStoreState): void {
    void records;
    void state;
    ${NOT_IMPLEMENTED}
  }
  revoke(input: { workspaceIdentity: string; hookDeclarationDigests: readonly string[] }): WorkspaceHookSecurityRevision {
    void input;
    ${NOT_IMPLEMENTED}
  }
  evaluateSnapshot(input: { snapshot: WorkspaceHookBundleSnapshot }): WorkspaceHookSnapshotEvaluation {
    void input;
    ${NOT_IMPLEMENTED}
  }
  getSecurityRevision(workspaceIdentity: string): WorkspaceHookSecurityRevision {
    void workspaceIdentity;
    ${NOT_IMPLEMENTED}
  }
  validateSecurityRevision(workspaceIdentity: string, revision: WorkspaceHookSecurityRevision): boolean {
    void workspaceIdentity;
    void revision;
    ${NOT_IMPLEMENTED}
  }
}
`,

  "workspace-hook-trust-domain.ts": `${header("workspace-hook-trust-domain.ts")}
export * from "./workspace-hook-policy.js";
export * from "./workspace-hook-trust-coordinator.js";
export * from "./workspace-hook-trust-records.js";
export type * from "./workspace-hook-trust-types.js";
`,

  "workspace-hook-trust-evaluation.ts": `${header("workspace-hook-trust-evaluation.ts")}${imports([
    "CanonicalWorkspaceHookEntry",
    "WorkspaceHookBundleSnapshot",
    "WorkspaceHookEffectiveState",
    "WorkspaceHookPolicy",
    "WorkspaceHookTrustRecord",
  ])}
import type { WorkspaceHookTrustStoreStatus } from "./workspace-hook-trust-types.js";
export function evaluateWorkspaceHookEntry(input: {
  entry: CanonicalWorkspaceHookEntry;
  snapshot: WorkspaceHookBundleSnapshot;
  policy: WorkspaceHookPolicy;
  persistentRecords: ReadonlyMap<string, WorkspaceHookTrustRecord>;
  revokedKeys: ReadonlySet<string>;
  storeStatus: WorkspaceHookTrustStoreStatus;
}): WorkspaceHookEffectiveState {
  void input;
  ${NOT_IMPLEMENTED}
}
export function trustKey(workspaceIdentity: string, hookDeclarationDigest: string): string {
  void workspaceIdentity;
  void hookDeclarationDigest;
  ${NOT_IMPLEMENTED}
}
`,

  "workspace-hook-trust-records.ts": `${header("workspace-hook-trust-records.ts")}${imports([
    "WorkspaceHookBundleSnapshot",
    "WorkspaceHookTrustRecord",
  ])}
export function createWorkspaceHookTrustRecords(input: {
  snapshot: WorkspaceHookBundleSnapshot;
  reviewItemIds: readonly string[];
  grantedAt: string;
  appVersion?: string;
}): WorkspaceHookTrustRecord[] {
  void input;
  ${NOT_IMPLEMENTED}
}
`,

  "workspace-hook-trust-types.ts": `${header("workspace-hook-trust-types.ts")}${imports([
    "WorkspaceHookEffectiveState",
    "WorkspaceHookPolicy",
    "WorkspaceHookReasonCode",
    "WorkspaceHookSecurityRevision",
  ])}
export type WorkspaceHookTrustStoreStatus = "missing" | "ok" | "corrupt";
export interface WorkspaceHookTrustStoreState { status: WorkspaceHookTrustStoreStatus; recoveredCorruptPath?: string }
export interface WorkspaceHookSnapshotEvaluation {
  workspaceIdentity: string;
  bundleDigest: string;
  policy: WorkspaceHookPolicy;
  securityRevision: WorkspaceHookSecurityRevision;
  storeStatus: WorkspaceHookTrustStoreStatus;
  reasonCode?: WorkspaceHookReasonCode;
  items: WorkspaceHookEffectiveState[];
}
`,
};
