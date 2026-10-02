import type { TurnState } from "../deps.js";
import type { ExecuteTurnOptions, TurnResult } from "../types.js";
import type { ActiveTurnStartReservation } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function executeTurn(this: AgentRuntimeInternal, input: string, attachments?: TurnState["attachments"], options?: ExecuteTurnOptions): Promise<TurnResult>;
export declare function executeTurnCommand(this: AgentRuntimeInternal, input: string, attachments?: TurnState["attachments"], options?: ExecuteTurnOptions, startReservation?: ActiveTurnStartReservation): Promise<TurnResult>;
