import { createRuntimeCommandId, type PromptRuntimeCommand } from "../command-queue.js";
import { enqueueCancellableRuntimeCommand } from "./runtime-command-submit.js";
import {
  createChildTraceContext,
  createQueryId,
  createTurnId,
  runWithContextAsync,
  TurnMachineImpl,
  type QueryId,
  type SessionEvent,
  type TurnState,
} from "../deps.js";
import {
  createTurnAbortScope,
  isTurnCancellationError,
  parseCompactCommand,
  parseRewindCommand,
} from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { ActiveTurnStartReservation, ExecuteTurnOptions, TurnResult } from "../types.js";
import { clearBrowserTurnState } from "../../repl/browser-turn-state.js";
import { endWindowsComputerTurn } from "./windows-computer-turn-end.js";
import { createTurnCommandOperation } from "./turn-command-operation.js";
import { logUnhandled, type TurnCommandLifetime } from "./turn-command-state.js";

export async function executeTurn(
  this: AgentRuntimeInternal,
  input: string,
  attachments?: TurnState["attachments"],
  options?: ExecuteTurnOptions,
): Promise<TurnResult> {
  return await enqueueCancellableRuntimeCommand<TurnResult, PromptRuntimeCommand>(this, {
    abortSignal: options?.abortSignal,
    createCommand: ({ reject, resolve }) => ({
      attachments,
      createdAt: new Date(),
      id: createRuntimeCommandId(),
      input,
      mode: "prompt",
      options,
      priority: "next",
      reject,
      resolve,
      traceContext: options?.traceContext ?? this.rootTraceContext,
    }),
  });
}

export async function executeTurnCommand(
  this: AgentRuntimeInternal,
  input: string,
  attachments?: TurnState["attachments"],
  options?: ExecuteTurnOptions,
  startReservation?: ActiveTurnStartReservation,
): Promise<TurnResult> {
  const selection = options?.intent?.modelSelection ?? this.getSessionModelSelection();
  const outputStyle = this.config.outputStyle;
  const compact = parseCompactCommand(input);
  const rewind = parseRewindCommand(input);
  const turnId = startReservation?.turnId ?? createTurnId();
  const queryId = options?.queryId ?? (options?.inputId as QueryId | undefined) ?? createQueryId();
  const displayInput = options?.displayInput ?? input;
  const trace =
    startReservation?.traceContext ??
    createChildTraceContext(options?.traceContext ?? this.rootTraceContext, {
      queryId,
      sessionId: this.sessionId,
      turnId,
      attributes: { turnNumber: this.turnNumber },
    });
  const traceId = trace.traceId;
  const startedAt = Date.now();
  const accountingInputId = options?.inputId ?? String(turnId);
  const events: SessionEvent[] = [];
  const machine = TurnMachineImpl.create(this.sessionId, this.turnNumber, input, traceId, turnId);
  this.currentTurnFileChanges = new Map();
  if (!startReservation) this.reserveTurnStart(turnId, trace, "regular");
  const abortScope = createTurnAbortScope(options?.abortSignal);
  const s: TurnCommandLifetime = {
    runtime: this,
    input,
    attachments,
    options,
    selection,
    outputStyle,
    compact,
    rewind,
    turnId,
    queryId,
    displayInput,
    trace,
    traceId,
    startedAt,
    accountingInputId,
    events,
    machine,
    abortScope,
    signal: abortScope.signal,
    activeTurn: undefined,
    target: null,
    heartbeat: undefined,
    userMessageId: undefined,
    loop: undefined,
    deferredTitle: false,
    phase: "queued",
    handled: false,
    preparation: undefined,
  };
  const telemetry = this.agentTelemetry.turn({
    inputSource: options?.inputSource,
    traceContext: trace,
    turnNumber: this.turnNumber,
  });
  const operation = createTurnCommandOperation(s);
  const execute = () =>
    runWithContextAsync(trace, operation).then(
      (result) => {
        telemetry.finishCompleted("assistant_message");
        return result;
      },
      (error) => {
        if (!s.handled) logUnhandled(s, error);
        if (isTurnCancellationError(error, s.signal)) telemetry.finishCancelled("abort_signal");
        else telemetry.finishFailed("unhandled", "unknown", error);
        throw error;
      },
    );
  return telemetry.run(execute).finally(async () => {
    if (s.heartbeat) clearInterval(s.heartbeat);
    this.releaseTurnStart(turnId);
    clearBrowserTurnState(this.sessionId, turnId);
    await endWindowsComputerTurn(this, trace);
    this.finishActiveTurn(s.activeTurn);
    abortScope.dispose();
    try {
      await this.browserControlPort?.turnEnded?.({
        sessionId: this.sessionId,
        turnId: String(turnId),
        traceContext: trace,
      });
    } catch (error) {
      this.logger?.warn("Browser turn cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
        event: "browser.turn_cleanup.failed",
        turnId: String(turnId),
      });
    }
  });
}
