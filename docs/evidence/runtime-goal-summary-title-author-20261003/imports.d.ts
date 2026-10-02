import { traceContextToLogContext } from "../deps.js";
import type { TraceContext } from "../deps.js";
import type { AgentTelemetryCausation } from "@knorvia/contracts";
import type { AgentRuntimeInternal } from "../internal.js";
import { GOAL_SUMMARY_TITLE_QUERY_SOURCE, generateTitleCandidate, normalizeTitleInput, } from "./title-generation-sidecar.js";
