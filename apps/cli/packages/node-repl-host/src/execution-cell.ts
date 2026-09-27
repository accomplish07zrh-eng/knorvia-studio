// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { resolve } from "node:path";
import { NodeReplSession, type NodeReplRunResult } from "@knorvia/core/repl";
import { createBrowserBridgeGlobals } from "./browser-bridge.js";
import { createComputerUseBridgeGlobals } from "./cua-bridge.js";
import type { ActiveNodeReplCall } from "./execution-binding.js";
import type { NodeReplExecuteInput } from "./execution-contract.js";

const CELL_GENERATION = 1;

/** Owns exactly one session and the revocable capability bindings issued for it. */
class ExecutionCell {
  readonly #input: NodeReplExecuteInput;
  readonly #call: ActiveNodeReplCall;
  readonly #base = process.env.KNORVIA_PLUGIN_ROOT ?? process.cwd();
  readonly #session: NodeReplSession;
  #open = true;

  constructor(input: NodeReplExecuteInput) {
    this.#input = input;
    this.#call = {
      generation: CELL_GENERATION,
      requestMeta: input.requestMeta,
      signal: input.signal,
    };
    this.#session = new NodeReplSession({
      restrictProcess: true,
      injectedGlobals: () => this.#bindings(),
    });
  }

  #bindings(): Record<PropertyKey, unknown> {
    const owner = {
      generation: CELL_GENERATION,
      getActiveCall: () => (this.#open ? this.#call : undefined),
      session: () => this.#session,
    };
    return {
      ...createBrowserBridgeGlobals({ ...owner, documentationRoot: resolve(this.#base, "docs") }),
      ...createComputerUseBridgeGlobals({
        ...owner,
        broker: this.#input.cuaBroker,
        documentationRoot: resolve(process.env.KNORVIA_CUA_PLUGIN_ROOT ?? this.#base, "docs"),
      }),
    };
  }

  async run(): Promise<NodeReplRunResult> {
    const { code, signal, requestMeta, syncTimeoutMs } = this.#input;
    try {
      return await this.#session.run(code, { signal, requestMeta, syncTimeoutMs });
    } finally {
      this.#open = false;
      this.#session.dispose();
    }
  }
}

export async function executeCell(input: NodeReplExecuteInput): Promise<NodeReplRunResult> {
  input.signal.throwIfAborted();
  return new ExecutionCell(input).run();
}
