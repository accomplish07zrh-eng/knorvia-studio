import { HookEventName, TurnMachineImpl, createMessageId, createPartId } from "../deps.js";
import type { MessageId, Model, TraceContext } from "../deps.js";
import { emptyTokenUsageInfo, toTokenUsageInfo } from "../helpers/index.js";
import type { RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { drainInlineGuideForNextRequest } from "./turn-guide-drain.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./turn-loop-state.js";
import { appendTurnRequestEntries, commitAssistantToTurnRequest, commitTurnRequestEntries, } from "./turn-output-token-continuation.js";
import { createRuntimeAssistantEntry } from "../../agent/message-history.js";
