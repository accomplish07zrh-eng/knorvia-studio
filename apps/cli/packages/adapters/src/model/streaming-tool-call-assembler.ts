// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { Logger, ModelStreamEvent, ModelToolCall } from "@knorvia/contracts";
import { normalizeModelToolInput } from "./tool-input-normalization.js";
import { normalizeModelToolName } from "./tool-call-validation.js";
interface StreamingToolCallAssemblerOptions {
  logger?: Logger;
}
interface Pending {
  id: string;
  name: string;
  input: string;
  providerExecuted?: boolean;
  ended: boolean;
}
export class StreamingToolCallAssembler {
  private readonly logger?: Logger;
  private readonly pending = new Map<string, Pending>();
  private readonly calls = new Map<string, ModelToolCall>();
  constructor(options: StreamingToolCallAssemblerOptions = {}) {
    this.logger = options.logger;
  }
  snapshotNormalizedToolCalls(): ModelToolCall[] {
    return [...this.calls.values()];
  }
  handle(event: ModelStreamEvent): ModelStreamEvent[] {
    if (event.type === "tool_input_start") {
      this.pending.set(event.id, {
        id: event.id,
        name: event.toolName,
        input: "",
        providerExecuted: event.providerExecuted,
        ended: false,
      });
      return [event];
    }
    if (event.type === "tool_input_delta") {
      const state = this.pending.get(event.id);
      if (state) state.input += event.delta;
      return [event];
    }
    if (event.type === "tool_input_end") {
      const state = this.pending.get(event.id);
      if (state) state.ended = true;
      return [event, ...this.commit(event.id)];
    }
    if (event.type === "tool_call") {
      const id = event.toolCall.id;
      if (this.calls.has(id)) return [];
      const pending = this.pending.get(id);
      if (pending && !pending.ended) return [];
      this.calls.set(id, event.toolCall);
    }
    return [event];
  }
  flush(): ModelStreamEvent[] {
    return [...this.pending.keys()].flatMap((id) => this.commit(id));
  }
  private commit(id: string): ModelStreamEvent[] {
    const state = this.pending.get(id);
    if (!state || this.calls.has(id)) return [];
    const call = {
      id,
      name: normalizeModelToolName(state.name, {
        toolCallId: id,
        providerExecuted: state.providerExecuted,
      }),
      input: normalizeModelToolInput(state.input, {
        logger: this.logger,
        source: "streamText",
        toolName: state.name,
      }),
      providerExecuted: state.providerExecuted,
    } as ModelToolCall;
    this.calls.set(id, call);
    this.pending.delete(id);
    return [{ type: "tool_call", toolCall: call }];
  }
}
