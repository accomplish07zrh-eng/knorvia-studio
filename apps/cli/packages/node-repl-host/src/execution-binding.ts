// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { NodeReplRequestMeta } from "@knorvia/core/repl";
import { BROWSER_UNAVAILABLE_IN_SUBAGENT_MESSAGE } from "./runtime-bridge.js";

export const CUA_UNAVAILABLE_IN_SUBAGENT_MESSAGE = "Computer Use is not available in subagent";
export interface ActiveNodeReplCall {
  generation: number;
  requestMeta: NodeReplRequestMeta;
  signal: AbortSignal;
}
interface ExecutionSource {
  generation: number;
  getActiveCall(): ActiveNodeReplCall | undefined;
}

export function activeCall(source: ExecutionSource, domain: string): ActiveNodeReplCall {
  const execution = source.getActiveCall();
  if (!execution || execution.generation !== source.generation) {
    throw new Error(`${domain} runtime binding is stale after kernel reset`);
  }
  execution.signal.throwIfAborted();
  if (execution.requestMeta.runtime_scope !== "subagent") return execution;
  throw new Error(
    domain === "Browser"
      ? BROWSER_UNAVAILABLE_IN_SUBAGENT_MESSAGE
      : CUA_UNAVAILABLE_IN_SUBAGENT_MESSAGE,
  );
}

/** The caller owns execution state. A binding only checks it at the I/O boundary. */
export class ExecutionBinding {
  constructor(
    readonly source: ExecutionSource,
    readonly domain: string,
  ) {}

  current(): ActiveNodeReplCall {
    return activeCall(this.source, this.domain);
  }

  async exchange<Reply, Value>(
    request: (execution: ActiveNodeReplCall) => Promise<Reply>,
    consume: (reply: Reply) => Value,
  ): Promise<Value> {
    const reply = await request(this.current());
    this.current();
    return consume(reply);
  }
}
