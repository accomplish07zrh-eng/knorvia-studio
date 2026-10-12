// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 workspace-hook-runtime-admission.ts）。仅签名，无实现。
import type {
  Logger,
  WorkspaceHookBundleSnapshot,
  WorkspaceHookReasonCode,
} from "@knorvia/contracts";
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
export class WorkspaceHookRuntimeAdmission implements WorkspaceHookRuntimeAdmissionPort {
  constructor(options: WorkspaceHookRuntimeAdmissionOptions) {
    void options;
    throw new Error("not implemented: core-hooks");
  }
  activate(source: WorkspaceHookActivationSource, signal?: AbortSignal): Promise<void> {
    void source;
    void signal;
    throw new Error("not implemented: core-hooks");
  }
  evaluateDispatch(input: WorkspaceHookDispatchInput): WorkspaceHookDispatchDecision {
    void input;
    throw new Error("not implemented: core-hooks");
  }
  getCurrentSnapshot(): WorkspaceHookBundleSnapshot {
    throw new Error("not implemented: core-hooks");
  }
  replaceSnapshot(snapshot: WorkspaceHookBundleSnapshot): void {
    void snapshot;
    throw new Error("not implemented: core-hooks");
  }
  invalidate(reasonCode: WorkspaceHookReasonCode): void {
    void reasonCode;
    throw new Error("not implemented: core-hooks");
  }
}
export function createWorkspaceHookRuntimeAdmission(
  options: WorkspaceHookRuntimeAdmissionOptions,
): WorkspaceHookRuntimeAdmission {
  void options;
  throw new Error("not implemented: core-hooks");
}
