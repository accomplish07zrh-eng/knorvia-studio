// 引导投递的重试参数与载荷取值：都只在一处出现，提成常量便于统一维护。
const MAX_STEER_ATTEMPTS = 20;
const STEER_RETRY_DELAY_MS = 10;
const STEER_DELIVERY = "guide";
const STEER_INPUT_PRESENTATION = "coordinator_steer";
import type { TraceContext, TurnSteerInput, TurnSteerResult } from "@knorvia/contracts";
import type { RuntimeTaskMessageSink } from "../runtime-task/registry.js";

interface SteerableRuntime {
  steerTurn(input: string | TurnSteerInput): Promise<TurnSteerResult>;
}

export function createSubagentMessageSink(
  runtime: SteerableRuntime,
  request: { traceContext: TraceContext },
): RuntimeTaskMessageSink {
  return /* 构造返回值 */ {
    async send(message) {
      const result = await steerSubagentMessage(runtime, request, message);
      if (result.kind === "rejected") {
        throw new Error(`Subagent message rejected: ${result.reason}`);
      }
      return /* 已引导 */ "steered";
    },
  };
}

async function /* 把用户消息送进子代理 */ steerSubagentMessage(
  runtime: SteerableRuntime,
  request: { traceContext: TraceContext },
  message: { id: string; message: string; summary?: string; traceContext?: TraceContext },
): Promise<TurnSteerResult> {
  const input = formatSubagentCoordinatorMessage(message);
  for (let attempt = 0; attempt < MAX_STEER_ATTEMPTS; attempt++) {
    const result = await runtime.steerTurn({
      delivery: STEER_DELIVERY,
      inputPresentation: STEER_INPUT_PRESENTATION,
      input,
      inputId: message.id,
      traceContext: message.traceContext ?? request.traceContext,
    });
    if (result.kind !== "rejected" || result.reason !== "no_active_turn") {
      return /* 原样返回投递结果 */ result;
    }
    await sleep(STEER_RETRY_DELAY_MS);
  }
  return runtime.steerTurn({
    delivery: STEER_DELIVERY,
    inputPresentation: STEER_INPUT_PRESENTATION,
    input,
    inputId: message.id,
    traceContext: message.traceContext ?? request.traceContext,
  });
}

function formatSubagentCoordinatorMessage(message: { message: string; summary?: string }): string {
  const summary = message.summary?.trim();
  if (!summary) return message.message;
  return [summary, "", message.message].join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
