// SPDX-License-Identifier: Apache-2.0
// S11/S12/S13/S14/S15/S16/S17/S18/S19：凭据 descriptor 面、provider 选择与密钥回退、
// schema 边界、不可读与损坏的区分、进程内串行化、跨进程锁，以及对话埋点服务的委托面。
// 密文格式、损坏留证与基本读改写已由 tests/credential.test.mjs（B4）覆盖，这里只补它没覆盖的面。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { importDeep, repoRoot, services, servicesNode } from "./entry.mjs";
import {
  encPrefix,
  knorviaDataRoot,
  makeTempRoot,
  pathExists,
  readText,
  registerCleanup,
  withEnv,
  writeText,
} from "./helpers.mjs";

const { createCredentialService } = servicesNode;
const { createConversationTelemetryService } = services;
const { createCredentialCipherProvider } = await importDeep(
  "credential/providers/credentialCipherProvider.ts",
);

const credentialsPath = (root) => join(knorviaDataRoot(root), "v2", "credentials.json");
const lockPathFor = (file) => `${file}.lock`;
const v2Dir = (root) => join(knorviaDataRoot(root), "v2");
const lockHolderFixture = fileURLToPath(
  new URL("./credential-broadcast-lock-holder.mjs", import.meta.url),
);

/** 只记录调用的桩 cipher：落盘内容与解密结果都由桩决定，便于区分「用的是哪个 provider」。 */
function makeRecordingCipher() {
  const calls = [];
  return {
    calls,
    encrypt(value) {
      calls.push(["encrypt", value]);
      return `stub:${value}`;
    },
    decrypt(value) {
      calls.push(["decrypt", value]);
      return value.startsWith("stub:") ? value.slice("stub:".length) : value;
    },
  };
}

/** 子进程 stdout 的行队列：时序断言只靠事件驱动，不用 sleep。 */
function lineQueue(stream) {
  const lines = createInterface({ input: stream });
  const queued = [];
  const waiters = [];
  lines.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else queued.push(line);
  });
  return {
    next: () =>
      queued.length > 0
        ? Promise.resolve(queued.shift())
        : new Promise((resolveLine) => waiters.push(resolveLine)),
  };
}

describe("S11 凭据 descriptor 与服务面（credential/credential.ts）", () => {
  it("descriptor 只暴露冻结频道名，服务实例实现 load/save/delete 三个方法", async (t) => {
    const deep = await importDeep("credential/credential.ts");
    assert.equal(deep.ICredentialService, services.ICredentialService);
    assert.deepEqual(Object.keys(deep.ICredentialService), ["channelName"]);
    // 频道名是兼容面上的冻结线值（packages/shared/src/channels.ts:81）。
    assert.equal(deep.ICredentialService.channelName, "credential");
    assert.notEqual(deep.ICredentialService.channelName, services.IBroadcastService.channelName);

    const root = await makeTempRoot(t);
    const service = createCredentialService();
    assert.deepEqual(Object.keys(service).sort(), ["delete", "load", "save"]);
    await service.save("descriptor-key", "descriptor-value");
    assert.equal(await service.load("descriptor-key"), "descriptor-value");
    assert.ok(
      JSON.parse(await readText(credentialsPath(root)))["descriptor-key"].startsWith(encPrefix),
    );
    await service.delete("descriptor-key");
    assert.equal(await service.load("descriptor-key"), null);
  });
});

describe("S12 provider 选择（credential/credentialService.ts）", () => {
  it("注入的 cipherProvider 决定落盘密文与解密结果，delete 不触碰解密", async (t) => {
    const root = await makeTempRoot(t);
    const cipher = makeRecordingCipher();
    const service = createCredentialService({ cipherProvider: cipher });

    await service.save("k1", "plain-one");
    const raw = JSON.parse(await readText(credentialsPath(root)));
    // 桩输出原样落盘：说明服务用的是注入的 provider，而不是默认 AES-GCM provider。
    assert.equal(raw.k1, "stub:plain-one");
    assert.ok(!raw.k1.startsWith(encPrefix));
    assert.equal(await service.load("k1"), "plain-one");
    assert.deepEqual(cipher.calls, [
      ["encrypt", "plain-one"],
      ["decrypt", "stub:plain-one"],
    ]);

    await service.delete("k1");
    assert.deepEqual(cipher.calls, [
      ["encrypt", "plain-one"],
      ["decrypt", "stub:plain-one"],
    ]);
    assert.deepEqual(JSON.parse(await readText(credentialsPath(root))), {});
  });

  it("未注入 provider 时走默认密文格式；value 原样进入 encrypt（不裁剪）", async (t) => {
    const root = await makeTempRoot(t);
    const cipher = makeRecordingCipher();
    const injected = createCredentialService({ cipherProvider: cipher });
    await injected.save("spaced", "  keep-me  ");
    assert.deepEqual(cipher.calls, [["encrypt", "  keep-me  "]]);

    const defaultService = createCredentialService();
    await defaultService.save("spaced", "  default-value  ");
    const raw = JSON.parse(await readText(credentialsPath(root)));
    assert.ok(raw.spaced.startsWith(encPrefix));
    assert.equal(await defaultService.load("spaced"), "  default-value  ");
    assert.equal(cipher.calls.length, 1);
  });
});

describe("S13 schema 边界（credential/credentialService.ts）", () => {
  it("key 先 trim 再落盘与读取；全空白 key、非字符串 value 被拒绝且不产生任何写入", async (t) => {
    const root = await makeTempRoot(t);
    const file = credentialsPath(root);
    const mutations = [];
    const cipher = makeRecordingCipher();
    const service = createCredentialService({
      cipherProvider: cipher,
      onDidMutate: (event) => mutations.push(event),
    });

    await service.save("  padded  ", "v");
    assert.deepEqual(Object.keys(JSON.parse(await readText(file))), ["padded"]);
    // 读取同样先归一化 key，所以带空白的查询能命中同一个键。
    assert.equal(await service.load("padded"), "v");
    assert.equal(await service.load("  padded "), "v");
    const callsAfterSave = cipher.calls.length;

    await assert.rejects(() => service.save("   ", "v"));
    await assert.rejects(() => service.delete("   "));
    await assert.rejects(() => service.load("   "));
    await assert.rejects(() => service.save("typed", 42));
    await assert.rejects(() => service.save("typed", null));
    await assert.rejects(() => service.save("typed", undefined));
    await assert.rejects(() => service.save("typed", { nested: true }));

    // schema 校验发生在 encrypt 与锁之前：非法输入既不加密也不落盘。
    assert.equal(cipher.calls.length, callsAfterSave);
    assert.deepEqual(mutations, [{ operation: "save", key: "padded" }]);
    assert.deepEqual(Object.keys(JSON.parse(await readText(file))), ["padded"]);
    assert.equal(await pathExists(lockPathFor(file)), false);
  });
});

describe("S14 缺失 / 不可读 / schema 损坏三种读取结果（credential/credentialService.ts）", () => {
  it("文件缺失返回 null 且不建文件；非 ENOENT 读取失败换稳定消息、不留证、不覆盖", async (t) => {
    const root = await makeTempRoot(t);
    const file = credentialsPath(root);
    const service = createCredentialService();

    assert.equal(await service.load("missing"), null);
    assert.equal(await pathExists(file), false);

    // 用目录冒充凭据文件：readFile 报的是 EISDIR/EPERM 而不是 ENOENT。
    await mkdir(file, { recursive: true });
    for (const attempt of [() => service.load("any"), () => service.save("any", "v")]) {
      await assert.rejects(
        attempt,
        (error) =>
          error.message.startsWith(`Unable to read Knorvia Studio credentials: ${file}`) &&
          typeof error.cause?.code === "string" &&
          error.cause.code !== "ENOENT",
      );
    }
    const names = await readdir(v2Dir(root));
    // 读不出来不等于「内容损坏」：不写 .corrupt-*.bak，也不留锁目录。
    assert.deepEqual(
      names.filter((name) => name.includes("corrupt")),
      [],
    );
    assert.equal(await pathExists(lockPathFor(file)), false);
  });

  it("合法 JSON 但值类型不合 schema 同样按损坏处理：拒绝覆盖并留下内容摘要备份", async (t) => {
    const root = await makeTempRoot(t);
    const file = credentialsPath(root);
    const corruptContent = `${JSON.stringify({ "good-key": { not: "a string" } })}\n`;
    await writeText(file, corruptContent);
    const service = createCredentialService();

    await assert.rejects(
      () => service.save("new-key", "v"),
      (error) => error.message === `Knorvia Studio credentials are corrupt: ${file}`,
    );
    await assert.rejects(() => service.load("good-key"), /are corrupt/u);
    assert.equal(await readText(file), corruptContent);

    const names = await readdir(v2Dir(root));
    const backups = names.filter((name) =>
      /^credentials\.json\.corrupt-[0-9a-f]{24}\.bak$/u.test(name),
    );
    // 两次失败读共用同一份摘要备份（按内容指纹命名，天然幂等）。
    assert.equal(backups.length, 1);
    assert.equal(await readText(join(v2Dir(root), backups[0])), corruptContent);
    assert.equal(await pathExists(lockPathFor(file)), false);
  });
});

describe("S15 进程内并发串行化（credential/credentialService.ts）", () => {
  it("并发 save 与并发 delete 在锁内串行：无丢更新、通知只在落盘之后、锁目录归还", async (t) => {
    const root = await makeTempRoot(t);
    const file = credentialsPath(root);
    const observed = [];
    const service = createCredentialService({
      onDidMutate: (event) => {
        // 通知时机必须是「已原子替换完成」：此刻同步读文件应当能看到（或已删除）该键。
        const snapshot = JSON.parse(readFileSync(file, "utf8"));
        observed.push({
          operation: event.operation,
          key: event.key,
          present: snapshot[event.key] !== undefined,
          keyCount: Object.keys(snapshot).length,
        });
      },
    });

    await Promise.all(
      Array.from({ length: 12 }, (_unused, index) =>
        service.save(`concurrent-${index}`, `value-${index}`),
      ),
    );

    const saveObservations = observed.filter((entry) => entry.operation === "save");
    assert.equal(saveObservations.length, 12);
    // 串行化的直接证据：每个 save 落盘时文件里的键数严格递增，没有两个 save 看到同一个快照。
    assert.equal(new Set(saveObservations.map((entry) => entry.keyCount)).size, 12);
    assert.equal(Math.max(...saveObservations.map((entry) => entry.keyCount)), 12);
    assert.deepEqual(
      saveObservations.filter((entry) => !entry.present),
      [],
    );

    let raw = JSON.parse(await readText(file));
    assert.deepEqual(
      Object.keys(raw).sort(),
      Array.from({ length: 12 }, (_unused, index) => `concurrent-${index}`).sort(),
    );
    assert.ok(
      Object.values(raw).every((value) => typeof value === "string" && value.startsWith(encPrefix)),
    );

    await Promise.all(
      Array.from({ length: 5 }, (_unused, index) => service.delete(`concurrent-${index}`)),
    );
    raw = JSON.parse(await readText(file));
    assert.equal(Object.keys(raw).length, 7);
    const deleteObservations = observed.filter((entry) => entry.operation === "delete");
    assert.equal(deleteObservations.length, 5);
    assert.deepEqual(
      deleteObservations.filter((entry) => entry.present),
      [],
    );
    // 临界区退出后锁目录必须被释放，否则后续进程要等到锁超时。
    assert.equal(await pathExists(lockPathFor(file)), false);
  });
});

describe("S16 跨进程锁（credential/credentialService.ts）", () => {
  it("别的进程持有 credentials.json.lock 时 save 必须等待，并在锁内重读以避免丢更新", async (t) => {
    const root = await makeTempRoot(t);
    const file = credentialsPath(root);
    const lockDir = lockPathFor(file);
    await mkdir(v2Dir(root), { recursive: true });

    const child = spawn(process.execPath, [lockHolderFixture, lockDir], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = lineQueue(child.stdout);
    const closed = new Promise((resolveClose) => child.once("close", () => resolveClose()));
    // 持锁子进程必须在任何断言之前登记：本用例后面有「锁未释放时 save 不完成」这类
    // 必然依赖真实时序的断言，失败时用例体中断，收尾只能靠钩子完成。
    registerCleanup(t, async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await closed;
    });

    assert.match(await stdout.next(), /^HELD \d+$/u);
    assert.equal(await pathExists(lockDir), true);

    const cipher = { encrypt: (value) => `stub:${value}`, decrypt: (value) => value };
    const service = createCredentialService({ cipherProvider: cipher });
    let saveSettled = false;
    const savePromise = service.save("late-key", "late-value").then(() => {
      saveSettled = true;
    });

    // 模拟另一个写者：锁被外部进程持有期间整文件替换。
    await writeText(file, `${JSON.stringify({ "manual-key": "plain-sentinel" })}\n`);
    assert.equal(saveSettled, false, "跨进程锁未释放前 save 不应完成");

    child.stdin.write("RELEASE\n");
    assert.equal(await stdout.next(), "RELEASED");
    await savePromise;

    // 锁内重读：外部写者的键与本次写入的键都在，谁都没丢。
    const raw = JSON.parse(await readText(file));
    assert.deepEqual(raw, { "late-key": "stub:late-value", "manual-key": "plain-sentinel" });
    assert.equal(await service.load("manual-key"), "plain-sentinel");
    assert.equal(await pathExists(lockDir), false);
  });
});

describe("S17 密钥缺失回退（credential/providers/credentialCipherProvider.ts）", () => {
  it("无 KNORVIA_CREDENTIAL_SECRET 时按本机身份派生稳定密钥：同机互解、空串等同缺失、默认读 process.env", async (t) => {
    const secretKey = "KNORVIA_CREDENTIAL_SECRET";
    const mixed = "混合-密钥-🔑-with-newline-\n-end";
    const fallbackA = createCredentialCipherProvider({ env: {} });
    const fallbackB = createCredentialCipherProvider({ env: { KNORVIA_UNRELATED: "x" } });

    const sample = fallbackA.encrypt(mixed);
    const secondSample = fallbackA.encrypt(mixed);
    assert.ok(sample.startsWith(encPrefix));
    assert.notEqual(sample, secondSample);
    // 回退密钥来自 platform/homedir/username，不含进程内随机量：同机两个实例互解。
    assert.equal(fallbackB.decrypt(sample), mixed);
    assert.equal(fallbackB.decrypt(secondSample), mixed);
    assert.equal(
      createCredentialCipherProvider({ env: { [secretKey]: "" } }).decrypt(sample),
      mixed,
    );
    // 显式密钥与回退密钥不通用：否则「配了密钥却用回退密钥解密」会静默读出错值。
    const explicit = createCredentialCipherProvider({ env: { [secretKey]: "from-env" } });
    assert.throws(
      () => explicit.decrypt(sample),
      (error) => error.code === "KNORVIA_CREDENTIAL_DECRYPT_FAILED",
    );
    const explicitOwn = explicit.encrypt(mixed);
    assert.equal(
      createCredentialCipherProvider({ env: { [secretKey]: "from-env" } }).decrypt(explicitOwn),
      mixed,
    );

    withEnv(t, secretKey, "from-env");
    assert.equal(createCredentialCipherProvider().decrypt(explicitOwn), mixed);
    withEnv(t, secretKey, undefined);
    assert.equal(createCredentialCipherProvider().decrypt(sample), mixed);
  });
});

describe("S18/S19 对话埋点服务（conversation-telemetry/conversationTelemetry.ts）", () => {
  function makeFakeAgentService() {
    return {
      calls: [],
      subscriptions: [],
      onDynamicConversationTelemetryFact(target) {
        this.calls.push(target);
        const listeners = [];
        const event = (listener) => {
          listeners.push(listener);
          this.subscriptions.push({ target, listeners });
          return {
            handle: "subscription-handle",
            dispose: () => {
              listeners.splice(listeners.indexOf(listener), 1);
            },
          };
        };
        event.fire = (fact) => {
          for (const listener of [...listeners]) listener(fact);
        };
        return event;
      },
    };
  }

  it("工厂是唯一运行时导出，onFact 按 onDynamic* 约定委托并把订阅句柄原样交回", async () => {
    const deep = await importDeep("conversation-telemetry/conversationTelemetry.ts");
    assert.deepEqual(Object.keys(deep).sort(), ["createConversationTelemetryService"]);
    assert.equal(deep.createConversationTelemetryService, createConversationTelemetryService);

    const fake = makeFakeAgentService();
    const service = createConversationTelemetryService(fake);
    assert.deepEqual(Object.keys(service), ["onFact"]);
    assert.equal(service.onFact.length, 1);

    const target = { workspacePath: "/tmp/whatever-workspace", workspaceIdentity: "identity-a" };
    const event = service.onFact(target);
    assert.equal(fake.calls.length, 1);
    // 透传调用方原对象：不裁剪、不重建，也不替调用方补 workspaceKey。
    assert.equal(fake.calls[0], target);
    assert.equal(typeof event, "function");

    const fact = { kind: "turn-completed", workspacePath: target.workspacePath };
    const seen = [];
    const firstHandle = event((value) => seen.push(value));
    // IDisposable 由底层事件实现原样返回，服务不再包一层。
    assert.equal(firstHandle.handle, "subscription-handle");
    event.fire(fact);
    assert.deepEqual(seen, [fact]);

    // 第二次 onFact 是新增订阅，不替换既有订阅（多消费者共存）。
    const secondEvent = service.onFact({ workspacePath: "/tmp/other" });
    assert.equal(fake.calls.length, 2);
    assert.notEqual(secondEvent, event);
    const secondSeen = [];
    secondEvent((value) => secondSeen.push(value));
    event.fire({ marker: "outer" });
    assert.deepEqual(seen, [fact, { marker: "outer" }]);
    assert.deepEqual(secondSeen, []);

    firstHandle.dispose();
    event.fire({ marker: "after-dispose" });
    assert.deepEqual(seen, [fact, { marker: "outer" }]);
  });

  it("target 白名单之外的字段原样透传；底层抛错不被吞掉", () => {
    const fake = makeFakeAgentService();
    const service = createConversationTelemetryService(fake);
    const wide = {
      workspacePath: "/tmp/wide",
      workspaceIdentity: "  ",
      sessionId: "should-not-be-filtered",
    };
    const returnedEvent = service.onFact(wide);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0], wide);
    assert.notEqual(service.onFact(wide), returnedEvent);
    assert.equal(fake.calls.length, 2);

    const throwing = {
      onDynamicConversationTelemetryFact() {
        throw new Error("runtime unavailable");
      },
    };
    assert.throws(
      () => createConversationTelemetryService(throwing).onFact({ workspacePath: "/tmp/any" }),
      /runtime unavailable/u,
    );
  });
});
