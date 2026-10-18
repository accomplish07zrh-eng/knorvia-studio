// SPDX-License-Identifier: Apache-2.0
// 引擎契约测试的**测试侧假 driver**（Boundary B 的 fake 装配）。
//
// 只经公开入口取符号（见 entry.mjs）：WorkflowEngine / InMemoryJournalStore / WorkflowError 都在根桶上。
// 假 driver 的职责是把「模型与世界」这两个外部事实变成测试可编程的脚本，并记下引擎下发的每一次
// 效应，供断言事件序列与 journal 行；它不做任何调度决策（那是合同的内容）。
import { dw } from "./entry.mjs";

const { WorkflowEngine, InMemoryJournalStore, WorkflowError, refToString } = dw;

/** 一个站点身份（`siteId@ordinal` 的结构化形态）。 */
export const inst = (siteId, ordinal = 1) => ({ siteId, ordinal });

/** 排空微任务 + macrotask 一次：driver 的 createActorSession 是 promise，派发落在其后。 */
export const tick = () => new Promise((resolveTick) => setImmediate(resolveTick));

function toMap(entries) {
  return new Map(Object.entries(entries));
}

/**
 * 世界读取脚本：函数按 `(op, args)` 返回结果或抛错；数组按 op 建表（每项 `{result}` 或 `{error}`，
 * 依次消费，耗尽即重复最后一项）。
 */
function worldResponder(script) {
  if (typeof script === "function") return script;
  const queues = new Map();
  for (const entry of script ?? []) {
    const queue = queues.get(entry.op) ?? [];
    queue.push(entry);
    queues.set(entry.op, queue);
  }
  return (op, args) => {
    const queue = queues.get(op);
    if (queue === undefined || queue.length === 0) return { op, args };
    const entry = queue.length === 1 ? queue[0] : queue.shift();
    if (entry.error !== undefined) throw entry.error;
    return entry.result;
  };
}

/**
 * 建一个假 driver。`options` 里每一项都是测试自己的选择，harness 不加任何默认行为。
 */
export function makeDriver(options = {}) {
  const journal = options.journal ?? new InMemoryJournalStore();
  const world = worldResponder(options.world);
  const hasArtifact = options.artifact !== undefined;
  const recorded = {
    events: [],
    emits: 0,
    sessions: [],
    starts: [],
    replies: [],
    cancelled: [],
    worldCalls: [],
    artifactCalls: [],
    disposeCount: 0,
  };
  const driver = {
    journal,
    createActorSession(actor, persona, seed) {
      recorded.sessions.push({ actor, persona, seed });
      return Promise.resolve({ id: `session@${refToString(actor)}` });
    },
    startAsk(session, instance, message) {
      recorded.starts.push({ session, instance, message });
    },
    respondToSubmit(instance, verdict) {
      recorded.replies.push({ instance, verdict });
    },
    cancelAsk(instance) {
      recorded.cancelled.push(instance);
    },
    executeWorldRead(op, args) {
      recorded.worldCalls.push({ op, args });
      return Promise.resolve().then(() => world(op, args));
    },
    emit(event) {
      recorded.events.push(event);
      recorded.emits += 1;
    },
    dispose() {
      recorded.disposeCount += 1;
    },
  };
  if (hasArtifact) {
    const artifact = options.artifact;
    driver.executeArtifactPublish = (request) => {
      recorded.artifactCalls.push(request);
      return Promise.resolve().then(() => {
        if (typeof artifact === "function") return artifact(request);
        if (artifact?.error !== undefined) throw artifact.error;
        return artifact;
      });
    };
  }
  return { driver, journal, recorded };
}

/**
 * 建一个引擎 + 假 driver 的装配。`options` 里 `runId` / `caps` / `askSpecs` / `validate` 直接进
 * EngineConfig，其余 EngineConfig 字段（scriptText、scriptHash、importedCache、inheritedTokens、
 * launch、args、name…）走 `options.engine`——假 driver 自己的脚本键（world / artifact / journal）
 * 因此不会被当作引擎配置传下去。
 */
export function makeHarness(options = {}) {
  const { driver, journal, recorded } = makeDriver(options);
  const runId = options.runId ?? "run-1";
  const engine = new WorkflowEngine({
    runId,
    driver,
    caps: options.caps ?? { maxConcurrency: 1 },
    askSpecs: options.askSpecs instanceof Map ? options.askSpecs : toMap(options.askSpecs ?? {}),
    validate:
      options.validate ??
      (() => {
        return [];
      }),
    ...options.engine,
  });
  return { engine, driver, journal, recorded, runId };
}

/** 一条已落库事件的语义序列（type 列表）——事件序列断言的主形状。 */
export function eventTypes(events) {
  return events.map((event) => event.type);
}

/** 把 (siteId, ordinal) 记成可读实例串，断言失败信息里比对象好读。 */
export function refOf(siteId, ordinal = 1) {
  return refToString({ siteId, ordinal });
}

/** 引擎的 journal 事件（持久轨），与 driver.emit（实时轨）应当逐条同一对象序列。 */
export function journalEvents(journal, runId) {
  return journal.listEvents(runId).map((stored) => stored.event);
}

/** 取一个节点行（不存在即 undefined）。 */
export function nodeRow(journal, runId, siteId, ordinal = 1) {
  return journal.getNode(runId, siteId, ordinal);
}

/** 抛错的 WorkflowError 断言助手：跑 promise，返回它拒绝的错（不拒绝即抛断言）。 */
export async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject, it resolved");
}

/** 构造一个测试用的 WorkflowError（错误码是合同，测试不靠文本匹配）。 */
export function wfError(code, message = `test ${code}`, extra) {
  return new WorkflowError(code, message, extra);
}

/**
 * 走完一次 ask 的对外协议：typed 站点走 submit，untyped 站点走 turn 结束。
 * 调用前必须已经 `await tick()`（派发已发生）。
 */
export function settleAsk(engine, instance, typed, value) {
  if (typed) engine.askSubmitAttempted(instance, value);
  else engine.askTurnEnded(instance, value);
}
