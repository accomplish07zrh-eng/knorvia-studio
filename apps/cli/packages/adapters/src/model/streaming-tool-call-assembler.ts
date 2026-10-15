// SPDX-License-Identifier: Apache-2.0
// 流式工具调用装配：tool_input_* 增量攒成完整调用，tool_input_end 后立即提交；
// provider 直给的 tool_call 只在「未被增量流占用且未提交」时采纳，同 id 只提交一次。
// 快照与冲刷都按提交顺序返回。

import type { Logger, ModelStreamEvent, ModelToolCall } from "@knorvia/contracts";
import { normalizeModelToolInput } from "./tool-input-normalization.js";
import { normalizeModelToolName } from "./tool-call-validation.js";

interface AssemblerOptions {
  logger?: Logger;
}

type Accumulator = {
  open: true;
  toolName: string;
  text: string;
  providerExecuted?: boolean;
  sealed: boolean;
};
type RegistryEntry = Accumulator | { open: false };

export class StreamingToolCallAssembler {
  private readonly warn?: Logger;
  private readonly registry = new Map<string, RegistryEntry>();
  private readonly adopted: ModelToolCall[] = [];

  constructor(options: AssemblerOptions = {}) {
    this.warn = options.logger;
  }

  snapshotNormalizedToolCalls(): ModelToolCall[] {
    return [...this.adopted];
  }

  handle(incoming: ModelStreamEvent): ModelStreamEvent[] {
    switch (incoming.type) {
      case "tool_input_start":
        this.registry.set(incoming.id, {
          open: true,
          toolName: incoming.toolName,
          text: "",
          providerExecuted: incoming.providerExecuted,
          sealed: false,
        });
        break;
      case "tool_input_delta": {
        const slot = this.registry.get(incoming.id);
        if (slot?.open) slot.text += incoming.delta;
        break;
      }
      case "tool_input_end": {
        const slot = this.registry.get(incoming.id);
        if (slot?.open) slot.sealed = true;
        return [incoming, ...this.commit(incoming.id)];
      }
      case "tool_call": {
        const slot = this.registry.get(incoming.toolCall.id);
        if (slot && !slot.open) return [];
        if (slot?.open && !slot.sealed) return [];
        this.adopt(incoming.toolCall);
        break;
      }
      default:
        break;
    }
    return [incoming];
  }

  flush(): ModelStreamEvent[] {
    const pending: ModelStreamEvent[] = [];
    for (const key of [...this.registry.keys()]) pending.push(...this.commit(key));
    return pending;
  }

  private adopt(call: ModelToolCall): void {
    this.registry.set(call.id, { open: false });
    this.adopted.push(call);
  }

  private commit(key: string): ModelStreamEvent[] {
    const slot = this.registry.get(key);
    if (!slot || !slot.open) return [];
    const assembled = {
      id: key,
      name: normalizeModelToolName(slot.toolName, {
        toolCallId: key,
        providerExecuted: slot.providerExecuted,
      }),
      input: normalizeModelToolInput(slot.text, {
        logger: this.warn,
        source: "streamText",
        toolName: slot.toolName,
      }),
      providerExecuted: slot.providerExecuted,
    } as ModelToolCall;
    this.adopt(assembled);
    return [{ type: "tool_call", toolCall: assembled }];
  }
}
