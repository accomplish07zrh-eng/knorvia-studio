import type { ReadFileStateMap } from "../deps.js";
import { type RuntimeMessageEntry } from "../../agent/message-history.js";
export declare function buildPostCompactReadStateReminderEntries(input: {
    maxFileApproxTokens?: number;
    maxFiles?: number;
    maxTotalApproxTokens?: number;
    preservedEntries?: readonly RuntimeMessageEntry[];
    readFileState?: ReadFileStateMap;
}): RuntimeMessageEntry[];
