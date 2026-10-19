// SPDX-License-Identifier: Apache-2.0
// 引擎契约测试的**测试侧假 driver**（Boundary B 的 fake 装配）。
//
// 只经公开入口取符号（见 entry.mjs）：WorkflowEngine / InMemoryJournalStore / WorkflowError 都在根桶上。
// 假 driver 的职责是把「模型与世界」这两个外部事实变成测试可编程的脚本，并记下引擎下发的每一次
// 效应，供断言事件序列与 journal 行；它不做任何调度决策（那是合同的内容）。
import { dw } from "./entry.mjs";

const { InMemoryJournalStore, WorkflowEngine, WorkflowError, refToString } = dw;

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

/**
 * 记**写入顺序**的 journal 包裹层：端口上「列值先于事件」「resume 不重建 run」这类承诺说的是两次
 * 写入的先后，只断言两侧值相等是钉不住的——同一个同步步骤里谁先谁后都相等。
 * 读方法原样透传，写方法记一笔 `trace`。
 */
export function tracedJournal(store) {
  const trace = [];
  const at = (label) => trace.push(label);
  return {
    trace,
    journal: {
      createRun(record) {
        at("createRun");
        return store.createRun(record);
      },
      getRun: (runId) => store.getRun(runId),
      updateRunStatus(runId, status, settlement) {
        at(`updateRunStatus:${status}`);
        return store.updateRunStatus(runId, status, settlement);
      },
      updateRunUsage(runId, spentTokens) {
        at(`updateRunUsage:${spentTokens}`);
        return store.updateRunUsage(runId, spentTokens);
      },
      putActor(record) {
        at("putActor");
        return store.putActor(record);
      },
      getActor: (runId, siteId, ordinal) => store.getActor(runId, siteId, ordinal),
      listActors: (runId) => store.listActors(runId),
      putNode(record) {
        at(`putNode:${record.status}`);
        return store.putNode(record);
      },
      getNode: (runId, siteId, ordinal) => store.getNode(runId, siteId, ordinal),
      listNodes: (runId) => store.listNodes(runId),
      appendEvent(runId, event) {
        at(`appendEvent:${event.type}`);
        return store.appendEvent(runId, event);
      },
      listEvents: (runId, opts) => store.listEvents(runId, opts),
    },
  };
}

// ————————————————————————————————————————————————————————————————
// 整轮装配（B26 golden 录制与 engine-run 回放共用这一份）。
//
// 与上面按站点手工推进的用法不同，这里跑的是**一次完整的 run**：脚本 → lowerWorkflowScript →
// 由 `__host` 执行 lowered 函数体 → drive 表在模型该动手的每个时刻应答 → 脚本兑现即
// `engine.complete`、抛出即 `engine.fail(DriverError)`（与 `dynamic-workflow-runtime` 的宿主
// 归一同形：脚本之错是一种错，本包只钉结算之前的引擎状态）。
//
// `__host` 不是引擎本身而是 Boundary A 的 shim：八逐个方法绑到引擎，外加冻结的 `args`。
// 引擎上没有 `args`（实参是沙箱侧注入，见 child-source.ts），直接递引擎会让每条带 `args`
// 的样例都录成 TypeError——那钉的是装配写错了，不是实现。
//
// drive 表约定见 `fixtures/families/engine-run.mjs` 顶部，两处必须一致：
//   asks[siteId] = 模型在该站点上的动作队列，消耗时刻是**派发之后**与每次 **reject / nudge
//                  裁决之后**——repair 与 nudge 都在同一次派发上重试，引擎不重新 startAsk；
//   world[op] / artifacts[contentOp] = 按调用序消耗，项为 `{result}` / `{record}` / `{error}`；
//   caps / args = 引擎 caps 覆盖与运行实参（args 同时进 EngineConfig，落 RunRecord）。
// **缺席即失败**：没准备应答的调用记进 `unprepared` 并让该次效应以 DriverError 拒绝——
// 静默补一个默认值等于把「引擎在这个点上收到了什么」从合同里抹掉；录制结束后 unprepared
// 非空即整体抛错，让夹具错误表现为测试失败而不是一条被固化的坏录制。
// ————————————————————————————————————————————————————————————————

/** 一次 run 的固定 runId（录制里不落 volatile 字段，故可以直接是常量）。 */
const RUN_ID = "run-golden";

/** WorkflowHostApi 的成员全集（engine/types.ts 的 Boundary A）：shim 只暴露这些。 */
const HOST_API_MEMBERS = [
  "ask",
  "createActor",
  "declareArtifact",
  "enterPhase",
  "log",
  "publishArtifact",
  "report",
  "worldRead",
];

/**
 * 按 key 归档的应答队列。`unwrap` 给出时返回该字段（世界读的 `result`、产物的 `record`），
 * 不给则返回整项（ask 的 `{kind,…}`）。缺备即记一笔 unprepared 并抛 DriverError。
 */
function driveQueue(table, label, unwrap, unprepared) {
  const queues = new Map(Object.entries(table ?? {}));
  const taken = new Map();
  return (key, detail) => {
    const queue = queues.get(key);
    const call = JSON.stringify(detail);
    if (queue === undefined) {
      unprepared.push(`${label} ${key} 没有准备应答（调用 ${call}）`);
      throw new WorkflowError("DriverError", `drive 表没为${label} ${key} 准备应答`);
    }
    const index = taken.get(key) ?? 0;
    if (index >= queue.length) {
      unprepared.push(
        `${label} ${key} 只备了 ${queue.length} 项，第 ${index + 1} 次调用没有应答（调用 ${call}）`,
      );
      throw new WorkflowError("DriverError", `drive 表里 ${label} ${key} 的队列已耗尽`);
    }
    taken.set(key, index + 1);
    const entry = queue[index];
    if (entry.error !== undefined) throw entry.error;
    return unwrap === undefined ? entry : entry[unwrap];
  };
}

/** 站点表 + 合成 schema → 引擎 askSpecs（生产侧唯一写法，见 schema/synthesize.ts 的 buildAskSpecs）。 */
export function askSpecsFor(script) {
  const workflow = dw.createWorkflowProgram(script);
  const table = dw.collectSites(workflow);
  const synthesized = dw.synthesizeAskSchemas(workflow, table);
  return { askSpecs: dw.buildAskSpecs(table, synthesized.schemas), synthesized, table };
}

/**
 * 一条样例的 lowering 录制载荷：诊断四字段（按输出顺序）、站点表、降级后的代码文本。
 * 录制侧与回放侧共用，两侧形状不可能分叉（dw01 的 golden 是同一个约定）。
 */
export function loweringRecord(sample) {
  const lowered = dw.lowerWorkflowScript(sample.script);
  return {
    id: sample.id,
    expect: sample.expect,
    ok: lowered.ok,
    diagnostics: lowered.diagnostics.map((entry) => ({
      code: entry.code,
      column: entry.column,
      line: entry.line,
      message: entry.message,
    })),
    siteIds: lowered.ok ? lowered.lowered.siteIds : null,
    code: lowered.ok ? lowered.lowered.code : null,
  };
}

/**
 * 跑一次 run，返回可直接 JSON.stringify 的录制载荷。录制侧与回放侧共用本函数，
 * 所以两侧的形状不可能分叉。
 */
export async function runEngineSample(sample) {
  const payload = loweringRecord(sample);
  if (!payload.ok) {
    // engine-run 族要求 clean：降不下来就是夹具坏了，让录制直接失败而不是录一条半成品。
    throw new Error(`${sample.id}: lowering 诊断 ${JSON.stringify(payload.diagnostics)}`);
  }

  const drive = sample.drive ?? {};
  const unprepared = [];
  const { askSpecs } = askSpecsFor(sample.script);
  const journal = new InMemoryJournalStore();
  const recorded = {
    emits: 0,
    sessions: [],
    starts: [],
    replies: [],
    cancelled: [],
    worldCalls: [],
    artifactCalls: [],
  };
  let engine;
  const world = driveQueue(drive.world, "世界读", "result", unprepared);
  const artifacts = driveQueue(drive.artifacts, "产物", "record", unprepared);
  const asks = driveQueue(drive.asks, "ask", undefined, unprepared);

  /** 一项 drive 应答 = 模型在该站点上的一个动作。kind 只有三种，未知即夹具写错。 */
  const send = (instance, entry) => {
    if (entry.kind === "submit") engine.askSubmitAttempted(instance, entry.value);
    else if (entry.kind === "text") engine.askTurnEnded(instance, entry.text);
    else if (entry.kind === "none") return;
    else throw new Error(`${sample.id}: 未知 drive kind ${entry.kind}`);
  };
  /**
   * 站点进入「等模型做点什么」的时刻：**派发之后**，以及每次 **reject / nudge 裁决之后**
   * （repair 与 nudge 都在同一次派发上重试，引擎不再重新 startAsk——B4/B5 钉的就是这个）。
   * 每个这样的时刻消耗该站点队列里的一项。
   */
  const nextAction = (instance, detail, onMissing) => {
    let entry;
    try {
      entry = asks(instance.siteId, detail);
    } catch (error) {
      if (onMissing !== undefined) onMissing(error);
      return;
    }
    // 生产侧的应答来自模型，必然在派发之后；同步回灌会让引擎在一次调用里重入自己。
    queueMicrotask(() => send(instance, entry));
  };

  const driver = {
    journal,
    createActorSession(actor, persona, seed) {
      recorded.sessions.push({ actor, persona, seed });
      return Promise.resolve({ id: `session@${refToString(actor)}` });
    },
    startAsk(session, instance, message) {
      recorded.starts.push({ session, instance, message });
      nextAction(instance, { instance, message }, (error) => {
        // 缺备：把这个实例按驱动失败结算，脚本的 await 于是拒绝；同时 unprepared
        // 让本次录制/回放整体失败——夹具写错要响两声，不能固化成一条坏录制。
        engine.askFailed(instance, error);
      });
    },
    respondToSubmit(instance, verdict) {
      recorded.replies.push({ instance, verdict });
      if (verdict.kind === "accept") return;
      nextAction(instance, { instance, verdict }, (error) => engine.askFailed(instance, error));
    },
    cancelAsk(instance) {
      recorded.cancelled.push(instance);
    },
    executeWorldRead(op, args) {
      recorded.worldCalls.push({ op, args });
      return Promise.resolve().then(() => world(op, args));
    },
    executeArtifactPublish(request) {
      recorded.artifactCalls.push(request);
      return Promise.resolve().then(() => artifacts(request.op, request));
    },
    emit() {
      // 实时轨与持久轨逐条同一序列是 B7/B23 的内容，录制里只需要一个计数。
      recorded.emits += 1;
    },
    dispose() {},
  };

  engine = new WorkflowEngine({
    runId: RUN_ID,
    driver,
    caps: drive.caps ?? { maxConcurrency: 1 },
    askSpecs,
    validate: dw.validate,
    ...(drive.args === undefined ? {} : { args: drive.args }),
  });

  /**
   * 递给脚本的是 **Boundary A 的 shim**，不是引擎本身：`args` 属于沙箱侧注入（facade 的
   * `declare const args` 承诺它恒有定义），而 `WorkflowEngine` 上根本没有这个成员；
   * `complete` / `fail` 属于宿主结算面，反过来不能出现在脚本够得着的表面上。
   * 逐项绑定 `this`，shim 之外的成员就一概不存在。
   */
  const host = Object.freeze(
    Object.fromEntries([
      ...HOST_API_MEMBERS.map((member) => [member, engine[member].bind(engine)]),
      ["args", Object.freeze({ ...drive.args })],
    ]),
  );
  const missing = HOST_API_MEMBERS.filter((member) => typeof engine[member] !== "function");
  if (missing.length > 0) {
    throw new Error(`${sample.id}: 引擎缺 Boundary A 成员 ${missing.join(", ")}`);
  }
  // shim 里的 `args` 是自己造的，不是从引擎上搬下来的：引擎上根本没有这个成员（实测
  // `"args" in engine === false`），它由沙箱子级垫片注入。若哪天引擎自己长出 `args`，
  // 这条会拦下来——那时「谁拥有 args」就有了两个作者，Boundary A 的分工不再唯一。
  if ("args" in engine) {
    throw new Error(
      `${sample.id}: WorkflowEngine 不该有 args 成员（args 属沙箱注入面，不是引擎面）`,
    );
  }

  const runFn = new Function(dw.HOST_BINDING, `return (async () => {\n${payload.code}\n})();`);
  let settled;
  try {
    settled = { ok: true, value: await runFn(host) };
  } catch (error) {
    settled = { ok: false, message: error?.message ?? String(error) };
  }
  if (settled.ok) engine.complete(settled.value);
  else engine.fail(new WorkflowError("DriverError", settled.message));
  await tick();

  if (unprepared.length > 0) {
    throw new Error(`${sample.id}: drive 表缺备\n  ${unprepared.join("\n  ")}`);
  }

  const run = journal.getRun(RUN_ID);
  const record = {
    // 静态那一半（诊断/站点表/降级代码）由 lowering.json 负责，这里不重复录第二份真相。
    expect: sample.expect,
    id: sample.id,
    run: {
      status: run.status,
      ...(run.stopReason === undefined ? {} : { stopReason: run.stopReason }),
      ...(run.supersededBy === undefined ? {} : { supersededBy: run.supersededBy }),
      ...(run.failure === undefined ? {} : { failure: run.failure }),
      ...(run.result === undefined ? {} : { result: run.result }),
      ...(run.args === undefined ? {} : { args: run.args }),
      spentTokens: run.spentTokens,
      caps: run.caps,
    },
    events: journal
      .listEvents(RUN_ID)
      .map((stored) => ({ sequence: stored.sequence, ...stored.event })),
    nodes: journal.listNodes(RUN_ID).map(withoutRunId),
    actors: journal.listActors(RUN_ID).map(withoutRunId),
    driver: recorded,
  };
  // JSON 往返一次：录制落盘就是这份文本，回放把新 run 也归到同一形状，
  // 否则 `{ seed: undefined }`（新）与 `{}`（录制）会被 deepEqual 当成两回事。
  return JSON.parse(JSON.stringify(record));
}

/**
 * journal 行的 runId 就是 RUN_ID 这个常量，每行重复一遍只是噪声；时间戳字段本就不在这些
 * 投影里（StoredEvent 的 timeCreated 只在 events 那一层，而事件轨取的是 sequence + event）。
 */
function withoutRunId(row) {
  const copy = { ...row };
  delete copy.runId;
  return copy;
}
