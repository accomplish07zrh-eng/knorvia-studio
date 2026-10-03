import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
export declare function runRegularTurnLoop(this: AgentRuntimeInternal, state: RegularTurnLoopState): Promise<void>;
