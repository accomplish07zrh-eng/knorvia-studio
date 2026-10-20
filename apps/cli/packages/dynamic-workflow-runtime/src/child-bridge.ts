// SPDX-License-Identifier: Apache-2.0
// 子进程 → 引擎的消息桥接。这条边界上只有四种消息，且它们的「承重程度」不同：
// 事件与 create-actor 必须同步落到引擎（顺序决定 journal），request 要等一次结算再回写，
// complete 收尾。
import { WorkflowError } from "@knorvia/dynamic-workflow";
import type { ResponseMessage } from "./protocol.js";
import { asWorkflowError, missingArtifactOp, toWireError, unknownActor } from "./bridge-errors.js";
import type {
  ActorFrame,
  BridgeContext,
  ChildFrame,
  CompleteFrame,
  EventFrame,
  RequestFrame,
} from "./bridge-types.js";

/** 分发一条 child → parent 消息。 */
export function routeChildMessage(message: ChildFrame, context: BridgeContext): void {
  // 按 kind 分四路：建 actor 映射、把事件交给引擎、收尾、应答一次调用。四者的时序要求不同，
  // 所以不做统一抽象——但入口只有一个。
  const handlers = new Map<ChildFrame["kind"], () => void>([
    ["create-actor", () => registerActor(message as ActorFrame, context)],
    ["event", () => emitEngineEvent(message as EventFrame, context)],
    ["complete", () => closeRun(message as CompleteFrame, context)],
    ["request", () => serveRequest(message as RequestFrame, context)],
  ]);
  handlers.get(message.kind)?.();
}

/**
 * 事件的落点。全部同步分派——异步化会让到达顺序与 journal 顺序脱钩，而一条打了标签的
 * report 必须晚于它的声明落库。四种事件各有一个目标，log 是兜底那一支。
 */
function emitEngineEvent(frame: EventFrame, context: BridgeContext): void {
  if (frame.type === "report") {
    context.workflow.report(frame.siteId, frame.item, frame.artifactId);
  } else if (frame.type === "declare-artifact") {
    context.workflow.declareArtifact(frame.siteId, frame.op, frame.args);
  } else if (frame.type === "phase-entered") {
    context.workflow.enterPhase(frame.name);
  } else {
    context.workflow.log(frame.message);
  }
}

/**
 * 建 actor 映射。同步执行是硬要求：stdio FIFO 保证任何引用该句柄的 ask 都在本条之后到达，
 * 只有在这里同步建好映射，后面的 ask 才找得到目标。createActor 在 run 已结算时会同步抛错，
 * 而此刻没有 response 通道可回，于是归成 run 失败（多为无害的收尾竞态）。
 */
function registerActor(frame: ActorFrame, context: BridgeContext): void {
  try {
    const created = context.workflow.createActor(
      frame.siteId,
      frame.name,
      frame.persona as string | undefined,
    );
    context.handles.set(frame.localId, created);
  } catch (cause) {
    context.fail(cause instanceof WorkflowError ? cause : actorFailure(cause, frame.siteId));
  }
}

/** createActor 失败：非 WorkflowError 一律包成 DriverError，并带上站点。 */
function actorFailure(cause: unknown, siteId: string): WorkflowError {
  return new WorkflowError("DriverError", `createActor failed at site ${siteId}`, { cause });
}

/** 结算：成功交回返回值；脚本抛错则以 DriverError 落库（错误明细来自沙箱）。 */
function closeRun(frame: CompleteFrame, context: BridgeContext): void {
  if (frame.ok) {
    context.workflow.complete(frame.value);
    return;
  }
  const detail = frame.error;
  context.fail(
    new WorkflowError("DriverError", detail?.message ?? "The workflow script threw an error", {
      cause: detail?.stack ?? detail?.name,
    }),
  );
}

/** 桥接一次需应答的宿主调用（ask / world-read / publish-artifact）并回写 response。 */
function serveRequest(frame: RequestFrame, context: BridgeContext): void {
  const outcome = startCall(frame, context);
  if ("rejected" in outcome) {
    reply(context, refusal(frame.id, outcome.rejected));
    return;
  }
  outcome.settle.then(
    (value) => reply(context, acceptance(frame.id, value)),
    (cause: unknown) => reply(context, refusal(frame.id, asWorkflowError(cause))),
  );
}

/** 成功应答的线形态。 */
function acceptance(id: string, value: unknown): ResponseMessage {
  return { kind: "response", id, ok: true, value };
}

/** 失败应答的线形态：错误走 toWireError 转成结构化拒绝。 */
function refusal(id: string, error: WorkflowError): ResponseMessage {
  return { kind: "response", id, ok: false, error: toWireError(error) };
}

/** 一次请求的归宿：要么当场结构化拒绝，要么带着引擎 promise 去等结算。 */
type CallOutcome = { rejected: WorkflowError } | { settle: Promise<unknown> };

/**
 * 请求按 type 找引擎入口。ask 的句柄缺失与 publish 的 op 缺失都是接线错误（lowering 恒填它们），
 * 归一成结构化拒绝而不是编个默认值——一个被当成 file 处理的 markdown 发布，其错误会出现在
 * 离故障点很远的地方。
 */
function startCall(frame: RequestFrame, context: BridgeContext): CallOutcome {
  if (frame.type === "ask") {
    const actorId = context.handles.get(frame.actor ?? "");
    return actorId === undefined
      ? { rejected: unknownActor(frame.actor) }
      : { settle: context.workflow.ask(frame.siteId, actorId, frame.instructions ?? "") };
  }
  if (frame.type === "publish-artifact") {
    const op = frame.artifactOp;
    return op === undefined
      ? { rejected: missingArtifactOp(frame.siteId) }
      : { settle: context.workflow.publishArtifact(frame.siteId, op, frame.args ?? []) };
  }
  // op / args 原样转交引擎：本层不看 op、不校验元数（那是 driver 的职责）。缺失 args 归一为
  // 空数组，让 driver 的实参校验大声拒绝，而不是在这里悄悄补一个默认值。
  return {
    settle: context.workflow.worldRead(frame.siteId, frame.op ?? "read", frame.args ?? []),
  };
}

/**
 * 写 response。子进程可能已退出（取消/失败收尾）：只在可写时写，EPIPE 一类竞态吞在这个边界上，
 * 此时 run 已经在结算流程里，没人会再读它。
 */
function reply(context: BridgeContext, response: ResponseMessage): void {
  const stdin = context.child.stdin;
  if (stdin === null || !stdin.writable) return;
  stdin.write(`${JSON.stringify(response)}\n`, () => undefined);
}
