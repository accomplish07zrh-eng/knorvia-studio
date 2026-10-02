import type { MessageId } from "../deps.js";
import { type SubagentMessageRuntimeCommand } from "../command-queue.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { EnqueueSubagentMessageInput } from "../types.js";
export declare function enqueueSubagentMessage(this: AgentRuntimeInternal, input: EnqueueSubagentMessageInput): undefined;
export declare function persistSubagentMessageCommand(this: AgentRuntimeInternal, command: SubagentMessageRuntimeCommand, midTurn?: boolean): Promise<MessageId>;
