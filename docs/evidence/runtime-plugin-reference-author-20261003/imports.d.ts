import { toMcpToolName } from "../../mcp/index.js";
import { buildPluginReferenceReminderBody, extractPluginReferences, type LivePluginMcpServer, type LivePluginSkill, type LivePluginSubagent, } from "../../plugin-reference/index.js";
import { createMessageId, traceContextToLogContext } from "../deps.js";
import type { TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
