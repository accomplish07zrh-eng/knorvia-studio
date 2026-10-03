import { createMessageId, traceContextToLogContext } from "../deps.js";
import type { MessageId } from "../deps.js";
import { createRuntimeCommandId, type SubagentMessageRuntimeCommand } from "../command-queue.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { EnqueueSubagentMessageInput } from "../types.js";
import { runtimeInputMetadata } from "../../agent/runtime-input-presentation.js";
import { escapeXml } from "../../runtime-task/notification.js";
