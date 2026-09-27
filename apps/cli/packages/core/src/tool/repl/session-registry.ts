// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { AsyncLocalStorage } from "node:async_hooks";
import type { JsRuntimeInput, SessionId } from "@knorvia/contracts";
import { setupBrowserRuntime } from "../../browser-client/index.js";
import { NodeReplSession } from "../../repl/node-repl-session.js";
import type { NodeReplRunResult } from "../../repl/session-contract.js";
import type { ToolExecutionContext } from "../types.js";
import { browserObservation } from "./browser-observations.js";

export const REPL_TIMEOUT = { defaultMs: 30_000, maxMs: 120_000, cleanupGraceMs: 2_000 } as const;
interface Invocation {
  entry: SessionEntry;
  context: ToolExecutionContext;
  live: boolean;
}

/** Capability configuration belongs to this entry; invocation identity does not. */
class SessionEntry {
  readonly session: NodeReplSession;
  private epoch = Symbol();

  constructor(
    configuration: ToolExecutionContext,
    currentCall: () => Invocation | undefined,
    registered: () => boolean,
  ) {
    const { browserControlPort: port, browserDocumentationRoot, sessionId } = configuration;
    this.session = new NodeReplSession({
      injectedGlobals: () => {
        const epoch = Symbol();
        this.epoch = epoch;
        const globals: Record<string, unknown> = {};
        if (!port) return globals;
        const check = (call = currentCall()): Invocation => {
          if (!registered() || epoch !== this.epoch)
            throw new Error("Browser runtime binding is stale after kernel reset");
          if (!call?.live || call.entry !== this)
            throw new Error("Browser runtime call is no longer active");
          call.context.abortSignal.throwIfAborted();
          return call;
        };
        const request = (call: Invocation) => ({
          sessionId,
          turnId: call.context.turnId,
          signal: call.context.abortSignal,
          ...(call.context.traceContext ? { traceContext: call.context.traceContext } : {}),
        });
        setupBrowserRuntime({
          globals,
          documentationRoot: browserDocumentationRoot,
          transport: {
            list: async () => {
              const call = check();
              const descriptors = await port.list(request(call));
              check(call);
              return descriptors;
            },
            execute: async (browserId, browserGeneration, command) => {
              const call = check();
              const result = await port.execute({
                ...request(call),
                browserId,
                browserGeneration,
                command,
              });
              // 旧请求即使未响应 abort，也不能把结果交给已结束调用继续操作下一回合。
              check(call);
              const observation = browserObservation(command, result);
              if (observation.screenshot)
                this.session.recordBrowserScreenshot(observation.screenshot);
              if (observation.meta) this.session.mergeResponseMeta(observation.meta);
              return result;
            },
          },
        });
        globals.setupBrowserRuntime = setupBrowserRuntime;
        return globals;
      },
    });
  }
}

/** NodeReplSession owns VM admission and reset; this registry only owns identity and lifetime. */
export class ReplToolSessions {
  private readonly entries = new Map<SessionId, SessionEntry>();
  private readonly calls = new AsyncLocalStorage<Invocation>();

  private acquire(context: ToolExecutionContext): SessionEntry {
    const existing = this.entries.get(context.sessionId);
    if (existing) return existing;
    const entry: SessionEntry = new SessionEntry(
      context,
      () => this.calls.getStore(),
      () => this.entries.get(context.sessionId) === entry,
    );
    this.entries.set(context.sessionId, entry);
    return entry;
  }

  run(input: JsRuntimeInput, context: ToolExecutionContext): Promise<NodeReplRunResult> {
    const entry = this.acquire(context);
    const invocation: Invocation = { entry, context, live: true };
    return this.calls.run(invocation, async () => {
      try {
        return await entry.session.run(input.code, {
          signal: context.abortSignal,
          syncTimeoutMs: Math.min(input.timeout_ms ?? REPL_TIMEOUT.defaultMs, REPL_TIMEOUT.maxMs),
          requestMeta: {
            sessionId: context.sessionId,
            title: input.title,
            toolCallId: context.toolCallId,
            traceId: context.traceId,
            turnId: context.turnId,
            workingDirectory: context.workingDirectory,
            workspaceRoot: context.workspaceRoot,
          },
        });
      } finally {
        // Busy 调用及旧 entry 的收尾只关闭自身归属，不能清掉其他调用的上下文。
        invocation.live = false;
      }
    });
  }

  dispose(sessionId: SessionId): void {
    const entry = this.entries.get(sessionId);
    this.entries.delete(sessionId);
    entry?.session.dispose();
  }
}
