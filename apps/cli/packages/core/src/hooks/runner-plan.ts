// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  HookExecutionDescriptor,
  HookInput,
  HookRunLifecyclePayload,
  Logger,
  SessionEventType,
} from "@knorvia/contracts";
import type { HookCallback, HookRegistration } from "./types.js";

export type CallbackValue = Awaited<ReturnType<HookCallback>>;
export interface RunnerEnvironment {
  defaultTimeoutMs: number;
  logger?: Logger;
}
export interface HookOccurrence {
  input: HookInput;
  hook: HookRegistration;
  descriptor: HookExecutionDescriptor;
  hookIndex: number;
  hookCount: number;
  hookInvocationId: string;
  hookRunId: string;
  startedAt: number;
  runtimeIndex: number;
}
export interface HookReport {
  type: SessionEventType;
  fields?: Partial<HookRunLifecyclePayload>;
}
export type HookStep =
  | { kind: "publish"; occurrence: HookOccurrence; report: HookReport }
  | { kind: "callback" | "detach"; occurrence: HookOccurrence; signal?: AbortSignal };
export type HookPlan<Result> = Generator<HookStep, Result, CallbackValue>;
