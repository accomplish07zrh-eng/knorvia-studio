// SPDX-License-Identifier: Apache-2.0
import type { EngineState } from "./engine-state.js";
import { canonicalJson, inputHash } from "./hash.js";
import { hashMismatch } from "./scheduler.js";
import type {
  InstanceRef,
  JournalStorePort,
  NodeKind,
  RunEvent,
  WorkflowErrorJson,
  WorldReadInput,
  WorldReadOp,
} from "./types.js";
import { refToString, WorkflowError } from "./types.js";
import { boundWorldReadInput } from "./world-read-input.js";

// 一次世界调用的全部准入事实。helper 之间传这个上下文，公共函数只负责铸造身份。
interface WorldCall {
  engine: EngineState;
  origin: InstanceRef;
  op: WorldReadOp;
  args: unknown[];
  kind: NodeKind;
  fingerprint: string;
  input: WorldReadInput;
}

type WorldOutcome = { ok: true; value: unknown } | { ok: false; error: WorkflowErrorJson };

interface SealOptions {
  store: boolean;
  cached: boolean;
}

// 落终态行。putNode 是整条替换，kind 与有界输入必须随结果一起回写。
function writeWorldRow(call: WorldCall, outcome: WorldOutcome): void {
  const { engine, origin, kind, fingerprint, input } = call;
  const place = { runId: engine.runId, siteId: origin.siteId, ordinal: origin.ordinal };
  const status = outcome.ok ? ("completed" as const) : ("failed" as const);
  const detail = outcome.ok ? { result: outcome.value } : { error: outcome.error };
  engine.journal.putNode({ ...place, kind, inputHash: fingerprint, input, status, ...detail });
}

// replay / 导入命中带 cached，live 结算不带。
function announceWorldOutcome(
  engine: EngineState,
  origin: InstanceRef,
  outcome: WorldOutcome,
  cached: boolean,
): void {
  const witness = cached ? { cached: true as const } : {};
  if (outcome.ok) {
    engine.record({ type: "node-settled", instance: origin, outcome: "ok", ...witness });
    return;
  }
  const failure = { outcome: "failed" as const, error: outcome.error };
  engine.record({ type: "node-settled", instance: origin, ...failure, ...witness });
}

// 结算一次世界调用：按需落行 + 发事件；失败侧从记录重建错误再抛。
function sealWorldCall(call: WorldCall, outcome: WorldOutcome, options: SealOptions): unknown {
  if (options.store) writeWorldRow(call, outcome);
  announceWorldOutcome(call.engine, call.origin, outcome, options.cached);
  if (!outcome.ok) throw WorkflowError.fromJSON(outcome.error);
  return outcome.value;
}

// journal replay：有记录就短路，running 记录返回 undefined 交给 live 重跑。
function replayWorld(call: WorldCall): Promise<unknown> | undefined {
  const { engine, origin, fingerprint } = call;
  const prior = engine.journal.getNode(engine.runId, origin.siteId, origin.ordinal);
  if (prior === undefined) return undefined;
  if (prior.inputHash !== fingerprint) {
    const mismatch = hashMismatch(origin, prior.inputHash, fingerprint);
    engine.failRun(mismatch);
    return Promise.reject(mismatch);
  }
  switch (prior.status) {
    case "completed":
      announceWorldOutcome(engine, origin, { ok: true, value: prior.result }, true);
      return Promise.resolve(prior.result);
    case "failed": {
      const error = prior.error!;
      announceWorldOutcome(engine, origin, { ok: false, error }, true);
      return Promise.reject(WorkflowError.fromJSON(error));
    }
    default:
      return undefined;
  }
}

// 导入缓存命中：写一行 completed 与一条 cached 事件，绝不触达 driver。
function importWorld(call: WorldCall): Promise<unknown> | undefined {
  const { engine, fingerprint } = call;
  if (engine.importClosed()) return undefined;
  const entry = engine.importedWorld.take(fingerprint);
  if (entry === undefined) return undefined;
  return Promise.resolve(
    sealWorldCall(call, { ok: true, value: entry.result }, { store: true, cached: true }),
  );
}

// 未命中任何记录：落 running、派发，再按 driver 的两种结局结算。
function liveWorld(call: WorldCall): Promise<unknown> {
  const { engine, origin, op, args, kind, fingerprint, input } = call;

  // world.run 是写世界：在派发前关门，与子代理的改写工具同一时刻。
  if (kind === "world-run") closeImportCache(engine, origin, "world-run");

  const place = { runId: engine.runId, siteId: origin.siteId, ordinal: origin.ordinal };
  const opening = { status: "running" as const, kind, inputHash: fingerprint, input };
  engine.journal.putNode({ ...place, ...opening });
  engine.record({ type: "node-queued", instance: origin, kind });
  engine.record({ type: "node-dispatched", instance: origin });

  return engine.driver.executeWorldRead(op, args).then(
    (value) => {
      if (engine.isRunSettled()) throw engine.runError();
      return sealWorldCall(call, { ok: true, value }, { store: true, cached: false });
    },
    (fault: unknown) => {
      const failure = asWorldFailure(fault, op, args);
      if (engine.isRunSettled()) throw engine.runError();
      return sealWorldCall(
        call,
        { ok: false, error: failure.toJSON() },
        { store: true, cached: false },
      );
    },
  );
}

function asWorldFailure(cause: unknown, op: WorldReadOp, args: unknown[]): WorkflowError {
  if (cause instanceof WorkflowError) return cause;
  const detail = canonicalJson(args);
  const text = `World read failed: ${op} ${detail}.`;
  return new WorkflowError("DriverError", text, { cause });
}

// readWorld 必须同步抛准入错误：带环或 BigInt 的实参在铸造身份时就以原生错误中止，
// 而不是变成一个稍后拒绝的 promise。
export function readWorld(
  state: EngineState,
  siteId: string,
  op: WorldReadOp,
  args: unknown[],
): Promise<unknown> {
  if (state.isRunSettled()) return Promise.reject(state.runError());
  const origin: InstanceRef = { siteId, ordinal: state.nextOrdinal(siteId) };
  const call: WorldCall = {
    engine: state,
    origin,
    op,
    args,
    kind: op === "run" ? "world-run" : "world-read",
    fingerprint: inputHash({ op, args }),
    input: boundWorldReadInput(op, args),
  };
  return replayWorld(call) ?? importWorld(call) ?? liveWorld(call);
}

// 关门是单向的。只有修订 run（存在导入表）才发事件——它是 resume 恢复门状态的唯一来源；
// 空名字与没有名字一样，不写 actorName。
export function closeImportCache(
  state: EngineState,
  instance: InstanceRef,
  cause: "mutating-tool" | "world-run",
  actorName?: string,
): void {
  const sealed = state.importClosed();
  if (sealed) return;
  state.closeImport();
  if (!state.importedCache) return;
  const closed: RunEvent = { type: "import-cache-closed", instance, cause };
  if (actorName !== undefined && actorName !== "") closed.actorName = actorName;
  state.record(closed);
}

// 从本 run 的事件轨恢复门状态与「曾 live 的 ask 实例」集合。ask 的 node-queued 只在
// live 准入时出现；缓存命中只发带 cached 的结算，因此这是精确集合。
export function recoverImportClosure(
  journal: JournalStorePort,
  runId: string,
): { live: ReadonlySet<string>; closed: boolean } {
  const live: string[] = [];
  let gateClosed = false;
  for (const stored of journal.listEvents(runId)) {
    const { event } = stored;
    switch (event.type) {
      case "import-cache-closed":
        gateClosed = true;
        break;
      case "node-queued":
        if (event.kind === "ask") live.push(refToString(event.instance));
        break;
      default:
        break;
    }
  }
  return { live: new Set(live), closed: gateClosed };
}
