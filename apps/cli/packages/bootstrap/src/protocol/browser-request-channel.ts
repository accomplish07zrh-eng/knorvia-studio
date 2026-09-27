// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { randomUUID } from "node:crypto";
import type {
  BrowserControlExecuteInput,
  BrowserControlListInput,
  BrowserDiscoveryContext,
  BrowserCommandResult,
  BrowserBackendDescriptor,
} from "@knorvia/contracts";
import {
  knorviaBrowserExecuteResultSchema,
  knorviaBrowserListResultSchema,
  knorviaProtocolMethods,
} from "@knorvia/shared";
import {
  protocolTraceFromTraceContext,
  requireSession,
  type KnorviaProtocolAgentServerContext,
} from "./server-types.js";
import type { BrowserConnectionIdentity } from "./browser-session-connections.js";

type LifecycleCommand = { method: "turnEnded"; turnId?: string } | { method: "closeSession" };

export class BrowserRequestChannel {
  readonly #context: KnorviaProtocolAgentServerContext;
  constructor(context: KnorviaProtocolAgentServerContext) {
    this.#context = context;
  }

  #admit(input: BrowserControlListInput): BrowserDiscoveryContext {
    const { workspace, deliveryKind } = requireSession(this.#context, input.sessionId);
    const identity = workspace.workspaceIdentity?.trim();
    const remote = workspace.remoteSessionId?.trim();
    const turn = input.turnId ?? input.traceContext?.turnId;
    return {
      sessionId: input.sessionId,
      requestId: randomUUID(),
      workspacePath: workspace.workspacePath,
      workspaceKey: identity || workspace.workspacePath,
      ...(identity ? { workspaceIdentity: identity } : {}),
      ...(remote ? { remoteSessionId: remote } : {}),
      ...(turn ? { turnId: String(turn) } : {}),
      clientMode: deliveryKind ?? "desktop-continuous",
      sessionContext: "live",
    };
  }

  async list(input: BrowserControlListInput): Promise<BrowserBackendDescriptor[]> {
    input.signal?.throwIfAborted();
    const request = this.#admit(input);
    const result = await this.#context.requestClient(
      knorviaProtocolMethods.interactionBrowserList,
      request,
      knorviaBrowserListResultSchema,
      {
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.traceContext ? { trace: protocolTraceFromTraceContext(input.traceContext) } : {}),
      },
    );
    return result.browsers;
  }

  async execute(
    input: BrowserControlExecuteInput,
    admitted: () => void,
  ): Promise<BrowserCommandResult> {
    const { signal, traceContext, browserId, browserGeneration, command } = input;
    signal?.throwIfAborted();
    const request = { ...this.#admit(input), browserId, browserGeneration };
    const traceOptions = traceContext ? { trace: protocolTraceFromTraceContext(traceContext) } : {};
    admitted();
    const cancel = () => {
      // 会话可能已在取消前移除；复用 admission 身份，不在事件监听中再次 requireSession。
      try {
        const acknowledgement = this.#context.requestClient(
          knorviaProtocolMethods.interactionBrowserExecute,
          {
            ...request,
            requestId: randomUUID(),
            command: { method: "cancelRequest", requestId: request.requestId },
          },
          knorviaBrowserExecuteResultSchema,
          traceOptions,
        );
        void acknowledgement.catch(() => undefined);
      } catch {
        // 取消是尽力通知；同步传输异常与异步拒绝均不得覆盖原请求或击穿进程。
      }
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return await this.#context.requestClient(
        knorviaProtocolMethods.interactionBrowserExecute,
        { ...request, command },
        knorviaBrowserExecuteResultSchema,
        { ...traceOptions, ...(signal ? { signal } : {}) },
      );
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  async notify(
    input: BrowserControlListInput,
    connection: BrowserConnectionIdentity,
    command: LifecycleCommand,
  ): Promise<void> {
    const request = this.#admit({ sessionId: input.sessionId, turnId: input.turnId });
    await this.#context.requestClient(
      knorviaProtocolMethods.interactionBrowserExecute,
      { ...request, ...connection, command },
      knorviaBrowserExecuteResultSchema,
    );
  }
}
