// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  type PermissionBrokerResult,
  type SessionEvent,
  type ToolExecutionSpanWriter,
} from "@knorvia/contracts";
import type { HookRunner, HookRunResult } from "../src/hooks/index.js";
import type { PermissionDecisionResult } from "../src/permission/service.js";
import type { BackgroundTaskTracker } from "../src/tool/executor/background-tasks.js";
import { executeToolCall } from "../src/tool/executor/call-runner.js";
import type { ToolExecuteOptions, ToolExecutorDeps } from "../src/tool/executor/types.js";
import type { ExecutableToolCall, ToolEntry, ToolExecutionContext } from "../src/tool/types.js";

export type HookInput = Parameters<HookRunner["run"]>[0];
export type HookOptions = Parameters<HookRunner["run"]>[1];
export const failure = { result: false as const, errorCode: 7, message: "fixture refusal" };
export function gate<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function invocation(overrides: Partial<ToolEntry> = {}) {
  const timeline: string[] = [];
  const events: SessionEvent[] = [];
  const observed: {
    contexts: ToolExecutionContext[];
    inputs: unknown[];
    hooks: { input: HookInput; options: HookOptions }[];
    telemetry: { name: string; args: unknown[] }[];
    registered: string[];
    lookups: string[];
    logs: unknown[][];
  } = { contexts: [], inputs: [], hooks: [], telemetry: [], registered: [], lookups: [], logs: [] };
  const behavior = {
    async handler(input: unknown, _context: ToolExecutionContext): Promise<unknown> {
      return input;
    },
    async hook(_input: HookInput, _options: HookOptions): Promise<HookRunResult> {
      return { additionalContexts: [] };
    },
    async event(_event: SessionEvent): Promise<void> {},
    async background(_call: ExecutableToolCall, _output: unknown): Promise<void> {},
    decision: "allow" as PermissionDecisionResult["decision"],
    reply: { decision: "allow" } as PermissionBrokerResult,
  };
  const entry: ToolEntry = {
    capability: "fixture",
    metadata: {
      name: "Fixture",
      readOnly: true,
      destructive: false,
      concurrentSafe: true,
      sideEffectScope: "none",
      riskLevel: "low",
      needsApproval: false,
    },
    inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
    outputSchema: {},
    permission: {
      permission: "fixture",
      reason: "fixture",
      riskLevel: "low",
      sideEffectScope: "none",
      needsApproval: false,
      patternSources: [],
      denyPriority: "beforeAsk",
    },
    resultBudget: { strategy: "inline", maxInlineBytes: 10000, maxModelBytes: 10000 },
    timeout: { kind: "none" },
    cancellation: { supported: true, cleanup: "none", userVisibleMessage: "fixture cancelled" },
    trace: { required: true, propagateToAdapters: true, recordInput: "none", recordOutput: "none" },
    handler: async (input, context) => {
      timeline.push("handler");
      observed.inputs.push(input);
      observed.contexts.push(context);
      return behavior.handler(input, context);
    },
    ...overrides,
  };
  const writer = Object.fromEntries(
    [
      "finishFailed",
      "finishDenied",
      "finishCancelled",
      "finishCompleted",
      "setPermissionDecision",
      "setOutputBytes",
      "setOutputTruncated",
      "markPermissionRequested",
    ].map((name) => [
      name,
      (...args: unknown[]) => {
        observed.telemetry.push({ name, args });
      },
    ]),
  ) as unknown as ToolExecutionSpanWriter;
  writer.run = (callback) => callback();
  const deps = {
    registry: {
      get(name: string) {
        observed.lookups.push(name);
        return name === entry.metadata.name || name === "alias" ? entry : undefined;
      },
      has: () => false,
      list: () => [entry.metadata.name, "Hidden"],
      getMetadata: (name: string) =>
        name === "Hidden" ? { providerVisible: false } : entry.metadata,
    },
    getMode: () => "build",
    getWorkingDirectory: () => ".",
    getWorkspaceRoot: () => ".",
    runtimeScope: "main",
    defaultTimeoutMs: 1000,
    maxConcurrency: 1,
    readFileState: new Map(),
    sessionId: "fixture-session",
    turnId: "fixture-turn",
    hookRunner: {
      async run(input: HookInput, options: HookOptions) {
        timeline.push(input.hookEventName);
        observed.hooks.push({ input, options });
        return behavior.hook(input, options);
      },
    },
    permissionService: {
      checkPermission() {
        timeline.push("permission");
        return {
          allowed: behavior.decision === "allow",
          decision: behavior.decision,
          escalated: false,
          mode: "build",
          reason: "fixture policy",
          riskLevel: "low",
          sideEffectScope: "none",
        };
      },
    },
    permissionBroker: {
      async requestPermission() {
        timeline.push("broker");
        return behavior.reply;
      },
    },
    async emitEvent(event: SessionEvent) {
      timeline.push(event.type);
      events.push(event);
      await behavior.event(event);
    },
    agentTelemetry: {
      startTool({ registeredToolName }: { registeredToolName: string }) {
        observed.registered.push(registeredToolName);
        return writer;
      },
    },
    logger: Object.fromEntries(
      ["info", "warn", "error", "debug"].map((level) => [
        level,
        (...args: unknown[]) => {
          observed.logs.push([level, ...args]);
        },
      ]),
    ),
  } as unknown as ToolExecutorDeps;
  const background = {
    async trackBackgroundTask(call: ExecutableToolCall, output: unknown) {
      timeline.push("background");
      await behavior.background(call, output);
    },
  } as unknown as BackgroundTaskTracker;
  const call: ExecutableToolCall = {
    id: "fixture-call",
    name: entry.metadata.name,
    input: { value: "initial" },
  };
  return {
    entry,
    deps,
    call,
    timeline,
    events,
    observed,
    writer,
    behavior,
    background,
    run: (options?: ToolExecuteOptions, execute = executeToolCall) =>
      execute(deps, background, call, options),
    terminal: () => observed.telemetry.filter((item) => item.name.startsWith("finish")),
  };
}

export function eventPayload(event: SessionEvent): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}
