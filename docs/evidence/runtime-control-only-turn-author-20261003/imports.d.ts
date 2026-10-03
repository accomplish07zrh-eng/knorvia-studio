import { SessionEventType, createChildTraceContext, createMessageId, createPartId, createTurnId, } from "../deps.js";
import type { MessageId, SyntheticUserMessageSource, TraceContext, TurnInputIntentMetadata, WorkflowLaunchMeta, } from "../deps.js";
import { buildUserContentFromTurn } from "../helpers/index.js";
import { realUserRuntimeMetadata } from "../../agent/message-history.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { ControlOnlyTurnRuntimeCommand } from "../command-queue.js";
import { buildProjectionAnchor } from "./projection-anchor.js";
import { maybeStartGoalSummaryTitleGeneration } from "./goal-summary-title.js";
import { maybeStartSessionTitleGeneration } from "./session-title.js";
