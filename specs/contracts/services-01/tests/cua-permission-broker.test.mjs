// SPDX-License-Identifier: Apache-2.0
// S41–S48、S56：Computer Use spawn admission 门禁、Helper 安装架构归一、
// 权限/PiP 服务描述符与投递编排、cua-permission-broker 子桶委托面。
// 时序用 node:test 的 mock timers 冻结时钟后按事件序列断言，不靠真实等待。
import assert from "node:assert/strict";
import { basename } from "node:path";
import { describe, it } from "node:test";

import { cuaBroker, importDeep, services, servicesNode } from "./entry.mjs";

const deepGate = await importDeep("cua-permission-broker/cuaAgentAdmissionGate.ts");
const deepInstaller = await importDeep("cua-permission-broker/cuaHelperInstaller.ts");
const deepPermission = await importDeep("cua-permission-broker/cuaPermissionService.ts");
const deepPipDescriptor = await importDeep("cua-permission-broker/cuaPipSession.ts");
const deepPipService = await importDeep("cua-permission-broker/cuaPipSessionService.ts");

const { CuaAgentAdmissionGate } = deepGate;
const {
  canonicalizeCuaHelperInstallerOptions,
  createCanonicalCuaHelperInstaller,
  normalizeCuaHelperArch,
  normalizeCuaHelperArchs,
} = servicesNode;
const { createCuaPipSessionOwner, createCuaPipSessionService } = deepPipService;

/** 把每条日志按级别记录下来，断言方向是「投递链实际写了哪条」而不是数量凑数。 */
function makeLogRecorder() {
  const entries = [];
  const record =
    (level) =>
    (...args) => {
      entries.push({ level, args });
    };
  return {
    entries,
    logger: {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
    },
  };
}

/** 让微任务队列跑完；mock timers 冻结后这是唯一的「推进」手段。 */
async function drain(rounds = 24) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
}

class FakePipClient {
  constructor(options) {
    this.options = options;
    this.connected = 0;
    this.closed = 0;
    this.sent = [];
    this.connectFailure = undefined;
    this.sendFailure = undefined;
  }

  async connect() {
    this.connected += 1;
    if (this.connectFailure !== undefined) throw this.connectFailure;
  }

  async send(event) {
    if (this.sendFailure !== undefined) throw this.sendFailure;
    this.sent.push(event);
    return { applied: false, reason: `synthetic-${event.kind}` };
  }

  close() {
    this.closed += 1;
  }
}

const turnStarted = (turnId) => ({
  kind: "turn-started",
  sessionId: "synthetic-session",
  turnId,
  eventId: `synthetic-start-${turnId}`,
  sequenceNumber: 1,
});

const focusChanged = (revision = 3) => ({
  kind: "focus-changed",
  sessionId: "synthetic-session",
  revision,
  sourceWindowId: "synthetic-window",
});

const turnEnded = (turnId) => ({
  kind: "turn-ended",
  sessionId: "synthetic-session",
  turnId,
  outcome: "completed",
  eventId: "synthetic-ended",
  sequenceNumber: 2,
});

describe("S41 CuaAgentAdmissionGate recovery 代际所有权", () => {
  it("S41 beginRecovery 在途幂等复用同一 epoch，commit 后才允许开启下一代", async () => {
    const gate = new CuaAgentAdmissionGate();
    assert.equal(gate.isRecovering(), false);

    const epoch = gate.beginRecovery();
    assert.equal(gate.isRecovering(), true);
    assert.equal(gate.beginRecovery(), epoch);
    assert.equal(gate.beginRecovery(), epoch);

    assert.equal(gate.commitRecovery(epoch), true);
    assert.equal(gate.isRecovering(), false);
    // 已收口的代际不能被再次 commit，也不能挡住新代际。
    assert.equal(gate.commitRecovery(epoch), false);

    const next = gate.beginRecovery();
    assert.notEqual(next, epoch);
    assert.equal(gate.commitRecovery(epoch), false);
    assert.equal(gate.failRecovery(epoch, new Error("stale")), false);
    assert.equal(gate.isRecovering(), true);
    assert.equal(gate.commitRecovery(next), true);
    assert.equal(gate.isRecovering(), false);
  });
});

describe("S42 CuaAgentAdmissionGate spawn 准入语义", () => {
  it("S42 未恢复时直接放行；恢复中排队的多个 spawn 由一次 commit 全部放行", async () => {
    const gate = new CuaAgentAdmissionGate();
    const order = [];
    await gate.waitForSpawnAdmission({ workspaceKey: "synthetic-open" });
    order.push("open-resolved");

    const epoch = gate.beginRecovery();
    const first = gate.waitForSpawnAdmission({
      workspaceKey: "synthetic-a",
      workspacePath: "/synthetic/a",
      workspaceIdentity: "identity-a",
    });
    const second = gate.waitForSpawnAdmission({ workspaceKey: "synthetic-b" });
    let settled = 0;
    first.then(() => {
      settled += 1;
      order.push("first");
    });
    second.then(() => {
      settled += 1;
      order.push("second");
    });
    await drain(2);
    assert.equal(settled, 0);
    assert.deepEqual(order, ["open-resolved"]);

    assert.equal(gate.commitRecovery(epoch), true);
    await Promise.all([first, second]);
    assert.equal(settled, 2);
    // 队列被清空：再次 commit 同一代际无效，新的 spawn 立即放行。
    assert.equal(gate.commitRecovery(epoch), false);
    await gate.waitForSpawnAdmission({ workspaceKey: "synthetic-c" });
    order.push("late-resolved");
    assert.deepEqual(order.slice(-1), ["late-resolved"]);
  });

  it("S42 abort 拒绝准入并把 waiter 从队列摘除；failRecovery 用同一 reason 拒绝所有排队者", async () => {
    const gate = new CuaAgentAdmissionGate();
    const cancelReason = new Error("synthetic pre-aborted");
    const controller = new AbortController();
    controller.abort(cancelReason);
    await assert.rejects(
      () =>
        gate.waitForSpawnAdmission({ workspaceKey: "synthetic-abort", signal: controller.signal }),
      (error) => error === cancelReason,
    );

    const epoch = gate.beginRecovery();
    const dropped = new AbortController();
    const droppedReason = new Error("synthetic dropped");
    const droppedPromise = gate.waitForSpawnAdmission({
      workspaceKey: "synthetic-dropped",
      signal: dropped.signal,
    });
    const survivor = gate.waitForSpawnAdmission({ workspaceKey: "synthetic-survivor" });
    dropped.abort(droppedReason);
    await assert.rejects(droppedPromise, (error) => error === droppedReason);
    // 摘除后 commit 不能再把已取消的 waiter 放回去。
    assert.equal(gate.commitRecovery(epoch), true);
    await survivor;

    const failedEpoch = gate.beginRecovery();
    const failure = new Error("synthetic helper recovery failed");
    const queued = [
      gate.waitForSpawnAdmission({ workspaceKey: "synthetic-d" }),
      gate.waitForSpawnAdmission({ workspaceKey: "synthetic-e" }),
    ];
    assert.equal(gate.failRecovery(failedEpoch, failure), true);
    const observed = await Promise.allSettled(queued);
    assert.deepEqual(
      observed.map((entry) => [entry.status, entry.reason]),
      [
        ["rejected", failure],
        ["rejected", failure],
      ],
    );
    assert.equal(gate.isRecovering(), false);
  });

  it("S42 failRecovery 把非 Error 原因包装成 Error；无 reason 的 abort 用固定取消文案", async () => {
    const gate = new CuaAgentAdmissionGate();
    const epoch = gate.beginRecovery();
    const pending = gate.waitForSpawnAdmission({ workspaceKey: "synthetic-f" });
    assert.equal(gate.failRecovery(epoch, "raw-string-reason"), true);
    await assert.rejects(
      pending,
      (error) => error instanceof Error && error.message === "raw-string-reason",
    );

    // 门禁只消费 signal 的 aborted/reason/addEventListener/removeEventListener 协议；
    // 这里用 reason 为空的 signal 触发「取消但无自定义原因」分支，验证固定文案。
    const listeners = [];
    const fakeSignal = {
      aborted: false,
      reason: undefined,
      addEventListener(_event, listener) {
        listeners.push(listener);
      },
      removeEventListener(_event, listener) {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    };
    const queueEpoch = gate.beginRecovery();
    const queued = gate.waitForSpawnAdmission({
      workspaceKey: "synthetic-g",
      signal: fakeSignal,
    });
    fakeSignal.aborted = true;
    for (const listener of [...listeners]) listener();
    assert.equal(listeners.length, 1);
    await assert.rejects(
      queued,
      (error) => error.message === "Knorvia Studio agent process start was cancelled.",
    );
    // 取消的 waiter 已摘除，收口只复位代际，不影响队列语义。
    assert.equal(gate.commitRecovery(queueEpoch), true);
    assert.equal(gate.isRecovering(), false);
  });
});

describe("S43/S44 Helper 安装架构归一与 canonical 包装", () => {
  it("S43 x86_64/amd64/x64 与 aarch64/arm64 归一到 Node 架构名，未知架构仅 trim", () => {
    assert.equal(normalizeCuaHelperArch("x86_64"), "x64");
    assert.equal(normalizeCuaHelperArch(" AMD64 "), "x64");
    assert.equal(normalizeCuaHelperArch("x64"), "x64");
    assert.equal(normalizeCuaHelperArch("AARCH64"), "arm64");
    assert.equal(normalizeCuaHelperArch("arm64"), "arm64");
    assert.equal(normalizeCuaHelperArch("  ppc64le "), "ppc64le");
    assert.equal(normalizeCuaHelperArch(""), "");
    assert.equal(normalizeCuaHelperArch, deepInstaller.normalizeCuaHelperArch);
  });

  it("S43 normalizeCuaHelperArchs 去重去空且不改动入参数组", () => {
    const input = Object.freeze(["x86_64", "amd64", "x64", "arm64", "aarch64", " ", "ppc64"]);
    assert.deepEqual(normalizeCuaHelperArchs(input), ["x64", "arm64", "ppc64"]);
    assert.deepEqual(
      input.map((value) => value),
      ["x86_64", "amd64", "x64", "arm64", "aarch64", " ", "ppc64"],
    );
    assert.deepEqual(normalizeCuaHelperArchs([]), []);
    assert.equal(normalizeCuaHelperArchs, deepInstaller.normalizeCuaHelperArchs);
  });

  it("S44 canonicalize 只替换 readExecutableArchs 为归一包装，其余字段原样保留", async () => {
    const requested = [];
    const readExecutableArchs = async (executablePath) => {
      requested.push(executablePath);
      return ["x86_64", "arm64", "aarch64", ""];
    };
    const verifyCodeSignature = async () => ({ ok: true });
    const original = {
      bundledAppPath: "/synthetic/KnorviaCuaHelper.app",
      dependencies: { readExecutableArchs, verifyCodeSignature },
    };
    const options = canonicalizeCuaHelperInstallerOptions(original);
    assert.equal(options.bundledAppPath, "/synthetic/KnorviaCuaHelper.app");
    // 只换掉读架构这一项：其余依赖按引用透传，原对象不被就地改写。
    assert.equal(options.dependencies.verifyCodeSignature, verifyCodeSignature);
    assert.notEqual(options.dependencies.readExecutableArchs, readExecutableArchs);
    assert.equal(original.dependencies.readExecutableArchs, readExecutableArchs);

    assert.deepEqual(await options.dependencies.readExecutableArchs("/synthetic/bin"), [
      "x64",
      "arm64",
    ]);
    assert.deepEqual(requested, ["/synthetic/bin"]);
  });

  it("S44 未注入依赖时回落 producer 默认验签依赖，结果与直接调用默认依赖一致", async () => {
    const wrapped = canonicalizeCuaHelperInstallerOptions({}).dependencies.readExecutableArchs;
    assert.equal(typeof wrapped, "function");
    const producerDefault = cuaBroker.defaultCuaHelperVerifierDependencies.readExecutableArchs;
    const outcome = async (fn) => {
      try {
        return { value: await fn("/synthetic/bin") };
      } catch (error) {
        return { error: { name: error.name, message: error.message } };
      }
    };
    assert.deepEqual(await outcome(wrapped), await outcome(producerDefault));
  });

  it("S44 createCanonicalCuaHelperInstaller 把归一后的 options 交给工厂；默认工厂产出 producer installer", async () => {
    const seen = [];
    const produced = createCanonicalCuaHelperInstaller(
      { dependencies: { readExecutableArchs: async () => ["aarch64", "arm64"] } },
      (options) => {
        seen.push(options);
        return { ensureInstalled: async () => "/synthetic/helper" };
      },
    );
    assert.equal(seen.length, 1);
    assert.deepEqual(await seen[0].dependencies.readExecutableArchs("/synthetic/bin"), ["arm64"]);
    assert.equal(await produced.ensureInstalled(), "/synthetic/helper");

    // 缺能力构建：默认 producer installer 的验签入口以 CuaHelperError 失败，而不是静默成功。
    const unavailable = createCanonicalCuaHelperInstaller({});
    assert.equal(typeof unavailable.ensureInstalled, "function");
    assert.equal(typeof unavailable.verifyInstalled, "function");
    for (const method of ["ensureInstalled", "verifyInstalled"]) {
      await assert.rejects(
        () => unavailable[method](),
        (error) => error instanceof cuaBroker.CuaHelperError,
        method,
      );
    }
  });
});

describe("S45/S46 权限与 PiP 服务描述符", () => {
  it("S45 ICuaPermissionService 由 services 单一铸造，三个入口指向同一 descriptor 对象", () => {
    assert.deepEqual(Object.keys(deepPermission).sort(), [
      "ICuaPermissionService",
      "isCuaPermissionStatusAvailable",
      "shouldRunCuaScreenCaptureProbe",
    ]);
    assert.equal(deepPermission.ICuaPermissionService.channelName, "cua-permission");
    assert.deepEqual(Object.keys(deepPermission.ICuaPermissionService), ["channelName"]);
    assert.equal(services.ICuaPermissionService, deepPermission.ICuaPermissionService);
    assert.equal(cuaBroker.ICuaPermissionService, deepPermission.ICuaPermissionService);
  });

  it("S45 available 谓词与抓屏探针谓词是 producer ports 的同一实现（缺能力构建不主动抓屏）", () => {
    assert.equal(
      services.isCuaPermissionStatusAvailable,
      deepPermission.isCuaPermissionStatusAvailable,
    );
    assert.equal(
      cuaBroker.isCuaPermissionStatusAvailable,
      deepPermission.isCuaPermissionStatusAvailable,
    );
    assert.equal(
      cuaBroker.shouldRunCuaScreenCaptureProbe,
      deepPermission.shouldRunCuaScreenCaptureProbe,
    );

    const granted = {
      available: true,
      grantOwner: null,
      accessibility: "granted",
      screenRecording: "granted",
    };
    assert.equal(deepPermission.isCuaPermissionStatusAvailable(granted), true);
    assert.equal(
      deepPermission.isCuaPermissionStatusAvailable({ ...granted, available: "true" }),
      false,
    );
    assert.equal(
      deepPermission.isCuaPermissionStatusAvailable({ available: false, reason: "helper down" }),
      false,
    );
    assert.equal(deepPermission.isCuaPermissionStatusAvailable(undefined), false);
    assert.equal(deepPermission.isCuaPermissionStatusAvailable(null), false);

    assert.equal(deepPermission.shouldRunCuaScreenCaptureProbe("granted"), false);
    assert.equal(deepPermission.shouldRunCuaScreenCaptureProbe(undefined), false);
    assert.equal(
      deepPermission.shouldRunCuaScreenCaptureProbe("unknown", { probeScreenCapture: true }),
      false,
    );
  });

  it("S46 ICuaPipSessionService 频道名冻结为 cua-pip-session 且与权限频道互不重叠", () => {
    assert.deepEqual(Object.keys(deepPipDescriptor), ["ICuaPipSessionService"]);
    assert.equal(deepPipDescriptor.ICuaPipSessionService.channelName, "cua-pip-session");
    assert.equal(services.ICuaPipSessionService, deepPipDescriptor.ICuaPipSessionService);
    assert.equal(cuaBroker.ICuaPipSessionService, deepPipDescriptor.ICuaPipSessionService);
    assert.notEqual(
      cuaBroker.ICuaPipSessionService.channelName,
      deepPermission.ICuaPermissionService.channelName,
    );
  });
});

describe("S47 PiP 客户端解析与凭据门", () => {
  it("S47 enabled=false 不解析凭据也不建客户端，publishFocus 与 publishLifecycle 同一入口", async () => {
    const { entries, logger } = makeLogRecorder();
    let credentialCalls = 0;
    let clientCalls = 0;
    const service = createCuaPipSessionService({
      enabled: false,
      resolveCredentials: async () => {
        credentialCalls += 1;
        throw new Error("disabled must not resolve credentials");
      },
      createClient: () => {
        clientCalls += 1;
        throw new Error("disabled must not build client");
      },
      logger,
    });
    assert.equal(service.publishFocus, service.publishLifecycle);
    await service.publishFocus(focusChanged());
    assert.equal(credentialCalls, 0);
    assert.equal(clientCalls, 0);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, "warn");
    assert.equal(entries[0].args[1], "[cua-pip-session] event delivery dropped");
    assert.deepEqual(entries[0].args[2], {
      kind: "focus-changed",
      revision: 3,
      sessionId: "synthetic-session",
      sourceWindowId: "synthetic-window",
      skipReason: "service-disabled",
    });
    // dispose 后连日志都不再产生：投递链彻底静默。
    service.dispose();
    await service.publishLifecycle(turnStarted("t-after-dispose"));
    assert.equal(entries.length, 1);
  });

  it("S47 同一 socketPath 复用客户端，换 socket 先关旧再建，诊断按级别分流", async () => {
    const { entries, logger } = makeLogRecorder();
    let socket = "/synthetic/pip-a";
    const clients = [];
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => ({ socketPath: socket }),
      createClient: (options) => {
        const client = new FakePipClient(options);
        clients.push(client);
        return client;
      },
      logger,
    });
    await service.publishFocus(focusChanged());
    assert.equal(clients.length, 1);
    assert.deepEqual(Object.keys(clients[0].options), ["socketPath", "onDiagnostic"]);
    assert.equal(clients[0].options.socketPath, "/synthetic/pip-a");
    assert.equal(clients[0].connected, 1);
    await service.publishLifecycle(turnEnded("t-1"));
    assert.equal(clients.length, 1);
    assert.equal(clients[0].sent.length, 2);
    assert.deepEqual(entries.at(-1).args[2], {
      eventId: "synthetic-ended",
      kind: "turn-ended",
      sequenceNumber: 2,
      sessionId: "synthetic-session",
      turnId: "t-1",
      outcome: "completed",
      applied: false,
      reason: "synthetic-turn-ended",
    });

    socket = "/synthetic/pip-b";
    await service.publishLifecycle(turnStarted("t-2"));
    assert.equal(clients.length, 2);
    assert.equal(clients[0].closed, 1);
    assert.equal(clients[1].options.socketPath, "/synthetic/pip-b");
    assert.deepEqual(
      clients[1].sent.map((event) => event.kind),
      ["turn-started"],
    );

    clients[1].options.onDiagnostic({ code: "version_mismatch", message: "peer older" });
    assert.equal(entries.at(-1).level, "warn");
    assert.equal(entries.at(-1).args[1], "[cua-pip-session] version_mismatch: peer older");
    clients[1].options.onDiagnostic({ code: "transport_note" });
    assert.equal(entries.at(-1).level, "debug");
    assert.equal(entries.at(-1).args[1], "[cua-pip-session] transport_note: undefined");

    service.dispose();
    assert.equal(clients[1].closed, 1);
    service.dispose();
    assert.equal(clients[1].closed, 1);
  });

  it("S47 connect 失败关闭客户端且不抛出，version_mismatch 隔离该 socket 直到换 pipe", async () => {
    const { entries, logger } = makeLogRecorder();
    let socket = "/synthetic/pip-flaky";
    let nextConnectFailure;
    const clients = [];
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => ({ socketPath: socket }),
      createClient: (options) => {
        const client = new FakePipClient(options);
        client.connectFailure = nextConnectFailure;
        clients.push(client);
        return client;
      },
      logger,
    });
    // 普通连接失败：投递链只记一条 failed 日志，且失败客户端被关闭、槽位清空。
    nextConnectFailure = new Error("synthetic connect reset");
    await service.publishFocus(focusChanged());
    assert.equal(clients.length, 1);
    assert.equal(clients[0].closed, 1);
    assert.equal(clients[0].sent.length, 0);
    assert.equal(entries.at(-1).args[1], "[cua-pip-session] event delivery failed");
    assert.equal(entries.at(-1).args[2].errorMessage, "synthetic connect reset");

    // version_mismatch 隔离该 socketPath：不再新建客户端，只记 transport-disabled。
    nextConnectFailure = Object.assign(new Error("synthetic peer mismatch"), {
      code: "version_mismatch",
    });
    await service.publishFocus(focusChanged(4));
    assert.equal(clients.length, 2);
    assert.equal(clients[1].closed, 1);
    await service.publishFocus(focusChanged(5));
    assert.equal(clients.length, 2);
    assert.deepEqual(entries.at(-1).args[2], {
      kind: "focus-changed",
      revision: 5,
      sessionId: "synthetic-session",
      sourceWindowId: "synthetic-window",
      skipReason: "transport-disabled",
    });
    assert.equal(entries.at(-1).args[1], "[cua-pip-session] event delivery skipped");

    // 换一条 pipe 就恢复投递：隔离只针对被判定不匹配的 socketPath。
    nextConnectFailure = undefined;
    socket = "/synthetic/pip-compatible";
    await service.publishLifecycle(turnStarted("t-recovered"));
    assert.equal(clients.length, 3);
    assert.deepEqual(
      clients[2].sent.map((event) => event.turnId),
      ["t-recovered"],
    );
    service.dispose();
    assert.equal(clients[2].closed, 1);
  });

  it("S47 tail 串行化：凭据未回时排队的两条事件按提交顺序落在同一客户端", async () => {
    const { logger } = makeLogRecorder();
    let credentialCalls = 0;
    let releaseCredentials;
    const gate = new Promise((resolve) => {
      releaseCredentials = resolve;
    });
    const clients = [];
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: () => {
        credentialCalls += 1;
        return credentialCalls === 1
          ? gate
          : Promise.resolve({ socketPath: "/synthetic/pip-serial" });
      },
      createClient: (options) => {
        const client = new FakePipClient(options);
        clients.push(client);
        return client;
      },
      logger,
    });
    const first = service.publishFocus(focusChanged());
    const second = service.publishLifecycle(turnStarted("t-serial"));
    await drain(4);
    assert.equal(clients.length, 0);
    releaseCredentials({ socketPath: "/synthetic/pip-serial" });
    await Promise.all([first, second]);
    assert.equal(clients.length, 1);
    assert.deepEqual(
      clients[0].sent.map((event) => event.kind),
      ["focus-changed", "turn-started"],
    );
    assert.equal(credentialCalls, 2);
    service.dispose();
  });

  it("S47 dispose 落在凭据等待期间：在途投递仍完成，后续事件记 service-disposed，再次 dispose 才释放客户端", async () => {
    const { entries, logger } = makeLogRecorder();
    let releaseCredentials;
    let credentialCalls = 0;
    const pending = new Promise((resolve) => {
      releaseCredentials = resolve;
    });
    const clients = [];
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: () => {
        credentialCalls += 1;
        return pending;
      },
      createClient: (options) => {
        const client = new FakePipClient(options);
        clients.push(client);
        return client;
      },
      logger,
    });
    const published = service.publishFocus(focusChanged());
    const queued = service.publishLifecycle(turnStarted("t-after"));
    await drain(4);
    // dispose 发生在凭据解析返回之前：owner 不再检查 disposed，仍按原凭据建连投递。
    service.dispose();
    releaseCredentials({ socketPath: "/synthetic/pip-late" });
    await published;
    assert.equal(clients.length, 1);
    assert.equal(clients[0].connected, 1);
    assert.deepEqual(
      clients[0].sent.map((event) => event.kind),
      ["focus-changed"],
    );
    // 排队事件此时才轮到，dispose 标志已在：不解析凭据、不建客户端，只记一条 dropped。
    await queued;
    assert.equal(clients.length, 1);
    assert.equal(credentialCalls, 1);
    assert.deepEqual(entries.at(-1).args[2], {
      eventId: "synthetic-start-t-after",
      kind: "turn-started",
      sequenceNumber: 1,
      sessionId: "synthetic-session",
      turnId: "t-after",
      skipReason: "service-disposed",
    });
    // 在途期间建立的客户端没被第一次 dispose 关闭；第二次 dispose 负责释放且只释放一次。
    assert.equal(clients[0].closed, 0);
    service.dispose();
    assert.equal(clients[0].closed, 1);
    const size = entries.length;
    await service.publishFocus(focusChanged(7));
    assert.equal(entries.length, size);
  });

  it("S47 createCuaPipSessionOwner 消费注入 ports：缺省 logger 由 createLogger 提供，日志上下文走 eventLogContext", async () => {
    let createLoggerCalls = 0;
    const { entries, logger } = makeLogRecorder();
    const contexts = [];
    const clients = [];
    const service = createCuaPipSessionOwner(
      {
        enabled: true,
        resolveCredentials: async () => ({ socketPath: "/synthetic/pip-ports" }),
      },
      {
        createClient: (options) => {
          const client = new FakePipClient(options);
          clients.push(client);
          return client;
        },
        createLogger: () => {
          createLoggerCalls += 1;
          return logger;
        },
        eventLogContext: (event) => {
          contexts.push(event.kind);
          return { tagged: event.kind };
        },
      },
    );
    await service.publishLifecycle(turnStarted("t-ports"));
    assert.equal(createLoggerCalls, 1);
    assert.deepEqual(contexts, ["turn-started"]);
    assert.deepEqual(entries.at(-1).args[2], {
      tagged: "turn-started",
      applied: false,
      reason: "synthetic-turn-started",
    });
    assert.equal(clients.length, 1);

    // options.logger 优先于 ports.createLogger
    const explicit = createCuaPipSessionOwner(
      {
        enabled: true,
        resolveCredentials: async () => ({ socketPath: "/synthetic/pip-explicit" }),
        logger,
      },
      {
        createClient: (options) => new FakePipClient(options),
        createLogger: () => {
          createLoggerCalls += 1;
          throw new Error("explicit logger must win");
        },
        eventLogContext: (event) => ({ tagged: event.kind }),
      },
    );
    await explicit.publishFocus(focusChanged());
    assert.equal(createLoggerCalls, 1);
    service.dispose();
    explicit.dispose();
  });
});

describe("S48 PiP 串行投递与 turn-started 延迟重放", () => {
  it("S48 无凭据时 turn-started 只保留最后一笔，凭据恢复后由下一个事件带动重放", async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000 });
    const { entries, logger } = makeLogRecorder();
    let credentials;
    const clients = [];
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => credentials,
      createClient: (options) => {
        const client = new FakePipClient(options);
        clients.push(client);
        return client;
      },
      logger,
    });
    await service.publishLifecycle(turnStarted("t-old"));
    await service.publishLifecycle(turnStarted("t-new"));
    assert.equal(clients.length, 0);
    assert.deepEqual(
      entries.map((entry) => entry.args[1]),
      ["[cua-pip-session] event delivery skipped", "[cua-pip-session] event delivery skipped"],
    );

    credentials = { socketPath: "/synthetic/pip-defer" };
    await service.publishFocus(focusChanged());
    assert.equal(clients.length, 1);
    assert.deepEqual(
      clients[0].sent.map((event) => event.turnId ?? event.kind),
      ["t-new", "focus-changed"],
    );
    const replayLogs = entries.filter(
      (entry) => entry.args[1] === "[cua-pip-session] replayed deferred turn-started",
    );
    assert.equal(replayLogs.length, 1);
    assert.equal(replayLogs[0].level, "info");
    assert.equal(replayLogs[0].args[2].turnId, "t-new");
    service.dispose();
  });

  it("S48 匹配的 turn-ended 与无 turnId 键的 session-closed 取消 pending；带 turnId:undefined 键不误取消", async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 2_000 });
    const { logger } = makeLogRecorder();
    let credentials;
    const clients = [];
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => credentials,
      createClient: (options) => {
        const client = new FakePipClient(options);
        clients.push(client);
        return client;
      },
      logger,
    });

    await service.publishLifecycle(turnStarted("t-a"));
    await service.publishLifecycle(turnEnded("t-a"));
    credentials = { socketPath: "/synthetic/pip-cancel" };
    await service.publishFocus(focusChanged());
    assert.deepEqual(
      clients[0].sent.map((event) => event.kind),
      ["focus-changed"],
    );

    credentials = undefined;
    await service.publishLifecycle(turnStarted("t-b"));
    await service.publishLifecycle({
      kind: "session-closed",
      sessionId: "synthetic-session",
      turnId: undefined,
    });
    credentials = { socketPath: "/synthetic/pip-cancel" };
    await service.publishFocus(focusChanged(9));
    assert.deepEqual(clients[0].sent.map((event) => event.turnId ?? event.kind).slice(-2), [
      "t-b",
      "focus-changed",
    ]);

    credentials = undefined;
    await service.publishLifecycle(turnStarted("t-c"));
    await service.publishLifecycle({ kind: "session-closed", sessionId: "synthetic-session" });
    credentials = { socketPath: "/synthetic/pip-cancel" };
    await service.publishFocus(focusChanged(11));
    assert.deepEqual(clients[0].sent.map((event) => event.turnId ?? event.kind).slice(-1), [
      "focus-changed",
    ]);
    service.dispose();
  });

  it("S48 重放定时器在 250ms 后自行重投挂起的 turn-started", async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 5_000 });
    const { entries, logger } = makeLogRecorder();
    let credentials;
    const clients = [];
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => credentials,
      createClient: (options) => {
        const client = new FakePipClient(options);
        clients.push(client);
        return client;
      },
      logger,
    });
    await service.publishLifecycle(turnStarted("t-timer"));
    t.mock.timers.tick(249);
    await drain();
    assert.equal(clients.length, 0);
    credentials = { socketPath: "/synthetic/pip-timer" };
    t.mock.timers.tick(1);
    await drain();
    assert.equal(clients.length, 1);
    assert.deepEqual(
      clients[0].sent.map((event) => event.turnId),
      ["t-timer"],
    );
    assert.ok(
      entries.some(
        (entry) =>
          entry.level === "info" &&
          entry.args[1] === "[cua-pip-session] replayed deferred turn-started",
      ),
    );
    service.dispose();
  });

  it("S48 超过 30s 截止后挂起的 turn-started 过期丢弃，并留下带事件上下文的 warn", async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 7_000 });
    const { entries, logger } = makeLogRecorder();
    let clientCalls = 0;
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => undefined,
      createClient: () => {
        clientCalls += 1;
        throw new Error("expiry path must not build a client");
      },
      logger,
    });
    await service.publishLifecycle(turnStarted("t-expire"));
    t.mock.timers.tick(250);
    await drain();
    assert.equal(clientCalls, 0);
    t.mock.timers.tick(30_000);
    await drain();
    const expired = entries.filter(
      (entry) =>
        entry.args[1] === "[cua-pip-session] deferred turn-started expired before transport",
    );
    assert.equal(expired.length, 1);
    assert.equal(expired[0].level, "warn");
    assert.deepEqual(expired[0].args[2], {
      eventId: "synthetic-start-t-expire",
      kind: "turn-started",
      sequenceNumber: 1,
      sessionId: "synthetic-session",
      turnId: "t-expire",
    });
    const size = entries.length;
    t.mock.timers.tick(60_000);
    await drain();
    assert.equal(entries.length, size);
    service.dispose();
  });

  it("S48 投递失败的日志走 warn 并携带 errorMessage，不影响后续事件继续投递", async () => {
    const { entries, logger } = makeLogRecorder();
    const clients = [];
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => ({ socketPath: "/synthetic/pip-fail" }),
      createClient: (options) => {
        const client = new FakePipClient(options);
        clients.push(client);
        return client;
      },
      logger,
    });
    await service.publishFocus(focusChanged());
    assert.equal(clients.length, 1);
    const failing = new Error("synthetic transport write failure");
    clients[0].sendFailure = failing;
    await service.publishLifecycle(turnStarted("t-fail"));
    const failure = entries.at(-1);
    assert.equal(failure.level, "warn");
    assert.equal(failure.args[1], "[cua-pip-session] event delivery failed");
    assert.equal(failure.args[2].errorMessage, failing.message);
    assert.equal(failure.args[2].turnId, "t-fail");
    assert.equal(failure.args[2].applied, undefined);

    clients[0].sendFailure = undefined;
    await service.publishFocus(focusChanged(5));
    assert.deepEqual(
      clients[0].sent.map((event) => event.kind),
      ["focus-changed", "focus-changed"],
    );
    assert.equal(clients[0].sent[1].revision, 5);
    service.dispose();
  });

  it("S48 日志本身抛错会沿 tail 传播：publish 以同一错误 reject 且后续事件不再解析凭据", async () => {
    const loggerFailure = new Error("synthetic logger failure");
    const { logger } = makeLogRecorder();
    let credentialCalls = 0;
    const service = createCuaPipSessionService({
      enabled: true,
      resolveCredentials: async () => {
        credentialCalls += 1;
        throw new Error("synthetic credential resolver failure");
      },
      createClient: () => {
        throw new Error("must not build a client");
      },
      logger: {
        ...logger,
        warn: () => {
          throw loggerFailure;
        },
      },
    });
    await assert.rejects(service.publishFocus(focusChanged()), (error) => error === loggerFailure);
    await assert.rejects(
      service.publishLifecycle(turnStarted("t-poison")),
      (error) => error === loggerFailure,
    );
    assert.equal(credentialCalls, 1);
    service.dispose();
  });
});

describe("S56 cua-permission-broker 子桶委托面", () => {
  it("S56 本地实现经子桶再导出仍是同一对象，不在 services 侧留副本", () => {
    assert.equal(cuaBroker.CuaAgentAdmissionGate, deepGate.CuaAgentAdmissionGate);
    assert.equal(cuaBroker.ICuaPermissionService, deepPermission.ICuaPermissionService);
    assert.equal(cuaBroker.ICuaPipSessionService, deepPipDescriptor.ICuaPipSessionService);
    assert.equal(cuaBroker.createCuaPipSessionService, createCuaPipSessionService);
    assert.equal(
      cuaBroker.isCuaPermissionStatusAvailable,
      deepPermission.isCuaPermissionStatusAvailable,
    );
    assert.equal(
      servicesNode.createCanonicalCuaHelperInstaller,
      deepInstaller.createCanonicalCuaHelperInstaller,
    );
    assert.equal(servicesNode.normalizeCuaHelperArchs, deepInstaller.normalizeCuaHelperArchs);
  });

  it("S56 委托到 @knorvia/cua 的名字在子桶可达并执行 producer 实现（本包不复制逻辑）", async () => {
    const delegated = [
      "BrokerError",
      "CuaHelperError",
      "isCuaHelperError",
      "dispatchRequest",
      "handleRequestLine",
      "parseRequestLine",
      "serializeResponse",
      "okResponse",
      "errorResponse",
      "errorResponseFromException",
      "notAuthorized",
      "notSelectable",
      "notSettable",
      "elementUnavailable",
      "actionUnavailable",
      "foregroundRequired",
      "isBrokerMethod",
      "isReadOnlyBrokerMethod",
      "callBrokerMethod",
      "BROKER_SOCKET_ENV",
      "BROKER_UNAVAILABLE_ENV",
      "mintBrokerSocketPath",
      "resolveBrokerSocketPath",
      "createCuaHelperInstaller",
      "defaultCuaHelperVerifierDependencies",
      "createProductCuaHelperHost",
      "HELPER_ADDON_ENV",
      "WINDOWS_DEV_CONTROL_PROTOCOL",
    ];
    for (const name of delegated) {
      assert.ok(name in cuaBroker, `子桶缺少委托名 ${name}`);
    }
    assert.equal(cuaBroker.BROKER_SOCKET_ENV, "KNORVIA_CUA_PERMISSION_BROKER_SOCKET");
    assert.equal(cuaBroker.BROKER_UNAVAILABLE_ENV, "KNORVIA_CUA_PERMISSION_BROKER_UNAVAILABLE");
    assert.deepEqual(cuaBroker.okResponse({ value: 1 }), { ok: true, result: { value: 1 } });
    assert.equal(
      cuaBroker.serializeResponse(cuaBroker.okResponse("x")),
      '{"ok":true,"result":"x"}\n',
    );
    assert.deepEqual(cuaBroker.errorResponse("boom", { code: "not_authorized" }), {
      ok: false,
      error: { message: "boom", code: "not_authorized" },
    });
    assert.deepEqual(cuaBroker.errorResponseFromException(new Error("inner")), {
      ok: false,
      error: { message: "inner" },
    });
    const notAuthorized = cuaBroker.notAuthorized("denied", { element: 1 });
    assert.ok(notAuthorized instanceof cuaBroker.BrokerError);
    assert.equal(notAuthorized.code, "not_authorized");
    assert.deepEqual(notAuthorized.details, { element: 1 });
    await assert.rejects(
      () => cuaBroker.callBrokerMethod({ socketPath: "/synthetic/pipe", method: "ping" }),
      (error) => error instanceof cuaBroker.BrokerError,
    );
    assert.equal(cuaBroker.isBrokerMethod("click"), false);
  });

  it("S56 socket 路径常量与铸造入口保持 producer 语义，跨平台只按 basename 断言", () => {
    const injected = cuaBroker.resolveBrokerSocketPath({
      env: { [cuaBroker.BROKER_SOCKET_ENV]: "/synthetic/fixed-pipe" },
    });
    assert.equal(injected, "/synthetic/fixed-pipe");
    const minted = cuaBroker.resolveBrokerSocketPath({ env: {} });
    assert.match(basename(minted), /^cua-broker-[0-9a-f-]{36}\.sock$/u);
    assert.equal(cuaBroker.defaultCuaHelperVerifierDependencies !== undefined, true);
    const placeholderHost = cuaBroker.createProductCuaHelperHost({});
    assert.equal(placeholderHost.running, false);
    assert.equal(placeholderHost.socketPath, null);
  });
});
