import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  StudioKernelCapabilities,
  StudioKernelId,
  StudioKernelStatus,
} from "../src/studio-runtime/kernelTypes.js";
import { createStudioKernelRegistry } from "../src/studio-runtime/adapters/kernels/kernelRegistry.js";
import { createKernelInspector } from "../src/studio-runtime/adapters/kernels/kernelInspection.js";
import { isolatedInspection } from "../src/studio-runtime/adapters/kernels/isolatedInspection.js";
import { externalUpdatePlan } from "../src/studio-runtime/adapters/kernels/externalUpdate.js";
import { BUILTIN_KERNEL_BY_ID } from "../src/studio-runtime/adapters/kernels/acpCatalog.js";
import type { KernelExecutable } from "../src/studio-runtime/adapters/kernels/executable.js";
import {
  ProbeCache,
  probeCacheKey,
  probeInstalled,
  probeSummary,
} from "../src/studio-runtime/adapters/kernels/probeResult.js";
import {
  assessKernelCapabilities,
  mergeAdvertisedCapabilities,
  versionSatisfies,
} from "../src/studio-runtime/domain/capabilityMatrix.js";
import {
  assertKernelPermission,
  kernelCapabilities,
} from "../src/studio-runtime/domain/kernelPolicy.js";

/** 夹具：--version 打印版本，ACP 模式写一行 initialize 记录后按 protocolVersion 应答。 */
function fixtureSource(wire: string, protocolVersion = 1): string {
  return String.raw`
const fs=require('node:fs');const readline=require('node:readline');
const args=process.argv.slice(2);
if(args.includes('--version')){console.log('fixture 1.2.3');process.exit(0)}
fs.appendFileSync(${JSON.stringify(wire)},'initialize\n');
readline.createInterface({input:process.stdin}).on('line',(line)=>{
 const m=JSON.parse(line);
 if(m.method==='initialize') return process.stdout.write(JSON.stringify({id:m.id,result:{protocolVersion:${protocolVersion},agentCapabilities:{loadSession:true}}})+'\n');
 if(m.id!==undefined) process.stdout.write(JSON.stringify({id:m.id,error:{code:-32601,message:'unsupported'}})+'\n');
});
`;
}

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-probe-stages-"));
  const wire = join(directory, "wire.jsonl");
  const executable = join(directory, "agent.cjs");
  await writeFile(executable, fixtureSource(wire));
  return {
    directory,
    wire,
    executable,
    async close() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function handshakes(wire: string): Promise<number> {
  try {
    return (await readFile(wire, "utf8")).split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

const opencode = BUILTIN_KERNEL_BY_ID.get("opencode")!;

function inspector(options: {
  dataDir: string;
  executable: string;
  resolve?: () => Promise<KernelExecutable & { managed: boolean }>;
  isolation?: typeof isolatedInspection;
  updatePlan?: typeof externalUpdatePlan;
  disposed?: boolean;
}) {
  return createKernelInspector({
    dataDir: options.dataDir,
    guarded: (_kernel, operation) => operation(new AbortController().signal),
    resolve:
      options.resolve ??
      (async () => ({
        command: process.execPath,
        args: [options.executable],
        path: options.executable,
        managed: false,
      })),
    isDisposed: () => options.disposed ?? false,
    // 默认注入空更新入口，避免夹具路径参与真实更新来源判定。
    updatePlan: options.updatePlan ?? (async () => undefined),
    ...(options.isolation ? { isolation: options.isolation } : {}),
  });
}

test("程序存在但协议失败与未安装可区分，定位证据不被版本/协议失败抹掉", async () => {
  const f = await workspace();
  const dataDir = join(f.directory, "data");
  try {
    const missing = await inspector({
      dataDir,
      executable: f.executable,
      resolve: async () => {
        throw new Error("agent 未安装或指定路径无效");
      },
    }).inspectOne(opencode);
    assert.equal(missing.installed, false);
    assert.equal(missing.origin, "missing");
    assert.equal(missing.probe?.stages.locate.status, "failed");
    assert.equal(missing.probe?.stages.locate.code, "locate.missing");
    assert.equal(missing.probe?.stages.version.code, "stage.not-reached");

    const mismatch = join(f.directory, "mismatch.cjs");
    await writeFile(mismatch, fixtureSource(f.wire, 2));
    const refused = await inspector({ dataDir, executable: mismatch }).inspectOne(opencode);
    assert.equal(refused.installed, false);
    // 与“未安装”不同：程序确实定位到了，只是协议握手失败。
    assert.equal(refused.origin, "external");
    assert.equal(refused.version, "1.2.3");
    assert.equal(refused.executablePath, mismatch);
    assert.equal(refused.probe?.stages.locate.status, "ok");
    assert.equal(refused.probe?.stages.version.status, "ok");
    assert.equal(refused.probe?.stages.protocol.status, "failed");
    assert.equal(refused.probe?.stages.protocol.code, "protocol.mismatch");
    assert.match(refused.probe?.stages.protocol.reason ?? "", /ACP v1/);
    assert.match(refused.error ?? "", /ACP v1/);

    const ok = await inspector({ dataDir, executable: f.executable }).inspectOne(opencode);
    assert.equal(ok.installed, true, ok.error);
    assert.equal(ok.origin, "external");
    assert.equal(ok.probe?.stages.protocol.status, "ok");
    assert.equal(probeInstalled(ok.probe!), true);
    assert.equal(probeSummary(ok.probe!), undefined);
  } finally {
    await f.close();
  }
});

test("账号段永不自动探测；握手成功只代表协议可用", async () => {
  const f = await workspace();
  try {
    const status = await inspector({
      dataDir: join(f.directory, "data"),
      executable: f.executable,
    }).inspectOne(opencode);
    assert.equal(status.probe?.stages.auth.status, "skipped");
    assert.equal(status.probe?.stages.auth.code, "auth.not-requested");
    assert.match(status.probe?.stages.auth.reason ?? "", /账号/);
    assert.equal(status.capabilities.resume, true);
    assert.equal(status.capabilities.readOnly, false);
    assert.equal(status.capabilities.fullAccess, false);
  } finally {
    await f.close();
  }
});

test("版本号不可解析时保留定位证据，协议与账号段记为未执行", async () => {
  const f = await workspace();
  const unparsable = join(f.directory, "silent.cjs");
  await writeFile(unparsable, "process.exit(0)");
  try {
    const status = await inspector({
      dataDir: join(f.directory, "data"),
      executable: unparsable,
    }).inspectOne(opencode);
    assert.equal(status.installed, false);
    assert.equal(status.origin, "external");
    assert.equal(status.executablePath, unparsable);
    assert.equal(status.version, undefined);
    assert.equal(status.probe?.stages.version.status, "failed");
    assert.equal(status.probe?.stages.version.code, "version.unparsable");
    assert.match(status.probe?.stages.version.reason ?? "", /版本号/);
    assert.equal(status.probe?.stages.protocol.code, "stage.not-reached");
    assert.equal(status.probe?.stages.auth.code, "stage.not-reached");
  } finally {
    await f.close();
  }
});

test("更新入口与隔离目录清理失败只记录，不覆盖已经成立的成功状态", async () => {
  const f = await workspace();
  const dataDir = join(f.directory, "data");
  try {
    const brokenUpdate = await inspector({
      dataDir,
      executable: f.executable,
      updatePlan: async () => {
        throw new Error("更新来源探测失败");
      },
    }).inspectOne(opencode);
    assert.equal(brokenUpdate.installed, true, brokenUpdate.error);
    assert.equal(brokenUpdate.origin, "external");
    assert.equal(brokenUpdate.version, "1.2.3");
    assert.equal(brokenUpdate.executablePath, f.executable);
    assert.equal(brokenUpdate.externalUpdate, undefined);
    assert.equal(brokenUpdate.error, undefined);

    const brokenTeardown = await inspector({
      dataDir,
      executable: f.executable,
      isolation: async () => ({
        cwd: f.directory,
        async close() {
          throw new Error("ACP 探测临时目录越界");
        },
      }),
    }).inspectOne(opencode);
    assert.equal(brokenTeardown.installed, true, brokenTeardown.error);
    assert.equal(brokenTeardown.origin, "external");
    assert.equal(brokenTeardown.version, "1.2.3");
    assert.equal(brokenTeardown.probe?.stages.protocol.status, "ok");
    assert.equal(brokenTeardown.error, undefined);
  } finally {
    await f.close();
  }
});

test("协议缓存：同键命中、refresh 绕过、invalidate 失效、键组件变化未命中", async () => {
  const f = await workspace();
  const dataDir = join(f.directory, "data");
  const inspection = inspector({ dataDir, executable: f.executable });
  try {
    const first = await inspection.inspectOne(opencode);
    assert.equal(first.installed, true, first.error);
    assert.equal(first.probe?.cached, undefined);
    assert.equal(await handshakes(f.wire), 1);

    const cached = await inspection.inspectOne(opencode);
    assert.equal(cached.probe?.cached, true);
    assert.equal(cached.capabilities.resume, true);
    assert.equal(await handshakes(f.wire), 1);
    assert.equal(cached.probe?.stages.version.status, "ok");

    const refreshed = await inspection.inspectOne(opencode, undefined, { refresh: true });
    assert.equal(refreshed.probe?.cached, undefined);
    assert.equal(await handshakes(f.wire), 2);

    inspection.invalidate();
    await inspection.inspectOne(opencode);
    assert.equal(await handshakes(f.wire), 3);

    // 键组件变化（可执行文件路径）必须重新握手。
    const other = join(f.directory, "other.cjs");
    await writeFile(other, fixtureSource(f.wire));
    await inspector({ dataDir, executable: other }).inspectOne(opencode);
    assert.equal(await handshakes(f.wire), 4);

    // 版本变化同样是另一个键。
    const newer = join(f.directory, "newer.cjs");
    await writeFile(newer, fixtureSource(f.wire).replace("fixture 1.2.3", "fixture 1.2.4"));
    await inspector({ dataDir, executable: newer }).inspectOne(opencode);
    assert.equal(await handshakes(f.wire), 5);
  } finally {
    await f.close();
  }
});

test("隔离探测每次新建临时 HOME 仍然命中同版本缓存", async () => {
  const f = await workspace();
  const dataDir = join(f.directory, "data");
  let created = 0;
  const isolation: typeof isolatedInspection = async () => {
    const cwd = await mkdtemp(join(f.directory, `inspect-${created++}-`));
    return {
      cwd,
      environment: { HOME: cwd, USERPROFILE: cwd, DSH_HOME: join(cwd, ".dsh") },
      async close() {},
    };
  };
  try {
    const inspection = inspector({ dataDir, executable: f.executable, isolation });
    const first = await inspection.inspectOne(opencode);
    assert.equal(first.installed, true, first.error);
    assert.equal(first.probe?.cached, undefined);
    // 两次探测使用不同的隔离 HOME，但键按 <isolated> 归一，因此必须命中。
    const second = await inspection.inspectOne(opencode);
    assert.equal(second.probe?.cached, true);
    assert.equal(created, 2);
    assert.equal(await handshakes(f.wire), 1);
  } finally {
    await f.close();
  }
});

test("探测结果缓存有界且带 TTL", () => {
  const key = probeCacheKey({
    kernel: "opencode",
    executablePath: "C:/tools/agent.exe",
    version: "1.2.3",
    environment: { PATH: "C:/bin" },
    workspaceIdentity: "C:/data",
  });
  const parts = key.split("\u0001");
  assert.deepEqual(parts.slice(0, 3), ["opencode", "C:/tools/agent.exe", "1.2.3"]);
  assert.match(parts[3] ?? "", /PATH=C:\/bin/);
  assert.equal(parts[4], "C:/data");
  assert.notEqual(
    key,
    probeCacheKey({
      kernel: "opencode",
      executablePath: "C:/tools/agent.exe",
      version: "1.2.4",
      environment: { PATH: "C:/bin" },
      workspaceIdentity: "C:/data",
    }),
  );
  const expiring = new ProbeCache<string>(0, 4);
  expiring.write(key, "value");
  assert.equal(expiring.read(key), undefined);
  const bounded = new ProbeCache<string>(60_000, 2);
  bounded.write("a", "a");
  bounded.write("b", "b");
  bounded.write("c", "c");
  assert.equal(bounded.size, 2);
  assert.equal(bounded.read("a"), undefined);
  assert.equal(bounded.read("c"), "c");
  bounded.clear();
  assert.equal(bounded.size, 0);
});

test("创建注册表时只给状态增加可选的 probe 字段，旧字段语义不变", async () => {
  const f = await workspace();
  const registry = createStudioKernelRegistry({
    dataDir: join(f.directory, "data"),
    builtin: {
      async run() {
        return { status: "succeeded" as const, text: "", resultKnown: true };
      },
    },
  });
  const prior = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  };
  try {
    // 只允许发现夹具本身：否则会探测到本机真实 CLI（含耗时的隔离握手），测试不再是离线的。
    process.env.PATH = f.directory;
    process.env.HOME = f.directory;
    process.env.USERPROFILE = f.directory;
    delete process.env.APPDATA;
    delete process.env.LOCALAPPDATA;
    const status = (
      await registry.inspect({ opencode: { executablePath: f.executable, permission: "ask" } })
    ).find((item) => item.id === "opencode")!;
    assert.deepEqual(Object.keys(status).sort(), [
      "capabilities",
      "displayName",
      "executablePath",
      "id",
      "installed",
      "management",
      "origin",
      "probe",
      "version",
    ]);
    assert.equal(status.installed, true, status.error);
    assert.equal(status.origin, "external");
    assert.equal(status.management, "external");
    assert.equal(status.version, "1.2.3");
    assert.equal(status.executablePath, f.executable);
    assert.equal(status.error, undefined);
    assert.deepEqual(Object.keys(status.capabilities).sort(), [
      "approval",
      "fullAccess",
      "questions",
      "readOnly",
      "resume",
    ]);
    assert.equal(status.probe?.stages.locate.code, "locate.ok");
    // 同一次注册表内的第二次探测命中协议缓存，不再重复握手。
    const again = (
      await registry.inspect({ opencode: { executablePath: f.executable, permission: "ask" } })
    ).find((item) => item.id === "opencode")!;
    assert.equal(again.probe?.cached, true);
    assert.equal(await handshakes(f.wire), 1);
    const explicit = (
      await registry.inspect(
        { opencode: { executablePath: f.executable, permission: "ask" } },
        {
          refresh: true,
        },
      )
    ).find((item) => item.id === "opencode")!;
    assert.equal(explicit.probe?.cached, undefined);
    assert.equal(await handshakes(f.wire), 2);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await registry.dispose();
    await f.close();
  }
});

const expectedCapabilities: Record<string, StudioKernelCapabilities> = {
  knorvia: { resume: true, approval: true, questions: true, readOnly: false, fullAccess: true },
  codex: { resume: true, approval: true, questions: true, readOnly: true, fullAccess: true },
  "claude-code": {
    resume: true,
    approval: true,
    questions: true,
    readOnly: false,
    fullAccess: true,
  },
  "grok-build": {
    resume: true,
    approval: true,
    questions: true,
    readOnly: false,
    fullAccess: true,
  },
  antigravity: {
    resume: true,
    approval: false,
    questions: false,
    readOnly: false,
    fullAccess: true,
  },
  opencode: {
    resume: false,
    approval: false,
    questions: false,
    readOnly: false,
    fullAccess: false,
  },
  qoder: { resume: false, approval: false, questions: false, readOnly: false, fullAccess: false },
  "qoder-cn": {
    resume: false,
    approval: false,
    questions: false,
    readOnly: false,
    fullAccess: false,
  },
  "gemini-cli": {
    resume: false,
    approval: false,
    questions: false,
    readOnly: false,
    fullAccess: false,
  },
  goose: { resume: false, approval: false, questions: false, readOnly: false, fullAccess: false },
  "kimi-cli": {
    resume: false,
    approval: false,
    questions: false,
    readOnly: false,
    fullAccess: false,
  },
  copilot: { resume: false, approval: false, questions: false, readOnly: false, fullAccess: false },
  hermes: { resume: false, approval: false, questions: false, readOnly: false, fullAccess: false },
  "qwen-code": {
    resume: false,
    approval: false,
    questions: false,
    readOnly: false,
    fullAccess: false,
  },
  "mistral-vibe": {
    resume: false,
    approval: false,
    questions: false,
    readOnly: false,
    fullAccess: false,
  },
  "deepseek-harness": {
    resume: false,
    approval: false,
    questions: false,
    readOnly: false,
    fullAccess: false,
  },
  "acp:local-agent": {
    resume: false,
    approval: false,
    questions: false,
    readOnly: false,
    fullAccess: false,
  },
};

test("能力矩阵与既有硬编码分支逐一等价；未核验版本失败关闭且证据可区分", () => {
  for (const [kernel, expected] of Object.entries(expectedCapabilities)) {
    const capabilities: StudioKernelCapabilities = assessKernelCapabilities({
      kernel,
    }).capabilities;
    assert.deepEqual(capabilities, expected, kernel);
    assert.deepEqual(kernelCapabilities(kernel as StudioKernelId), expected);
  }
  const verified = assessKernelCapabilities({ kernel: "codex", version: "0.151.0" });
  assert.equal(verified.capabilities.readOnly, true);
  assert.equal(verified.decisions.readOnly.evidence, "verified");
  assert.equal(verified.matrixVersion.length > 0, true);

  const older = assessKernelCapabilities({ kernel: "codex", version: "0.100.0" });
  assert.equal(older.capabilities.readOnly, false);
  assert.equal(older.decisions.readOnly.evidence, "unverified");
  assert.equal(older.decisions.resume.evidence, "unverified");

  const unknown = assessKernelCapabilities({ kernel: "codex" });
  assert.equal(unknown.capabilities.readOnly, true);
  assert.equal(unknown.decisions.readOnly.evidence, "declared");

  const antigravity = assessKernelCapabilities({ kernel: "antigravity", version: "1.2.2" });
  assert.equal(antigravity.capabilities.resume, true);
  assert.equal(antigravity.capabilities.approval, false);
  assert.equal(antigravity.decisions.approval.evidence, "unsupported");
  assert.equal(antigravity.decisions.readOnly.evidence, "unsupported");
});

test("运行前权限断言按矩阵拒绝未核验或明确不支持的只读", () => {
  assert.doesNotThrow(() => assertKernelPermission("codex", "read-only"));
  assert.doesNotThrow(() => assertKernelPermission("codex", "read-only", { version: "0.151.0" }));
  assert.throws(
    () => assertKernelPermission("codex", "read-only", { version: "0.100.0" }),
    /不会自动放宽权限/,
  );
  assert.throws(() => assertKernelPermission("gemini-cli", "read-only"), /只读/);
  assert.throws(() => assertKernelPermission("claude-code", "read-only"), /只读/);
  assert.doesNotThrow(() => assertKernelPermission("gemini-cli", "ask"));
  // 用户显式例外只能由调用方传入，矩阵自身永不产生。
  assert.doesNotThrow(() =>
    assertKernelPermission("gemini-cli", "read-only", {
      exception: { capability: "readOnly", reason: "用户已确认风险" },
    }),
  );
  const exception = assessKernelCapabilities({
    kernel: "gemini-cli",
    exception: { capability: "readOnly" },
  });
  assert.equal(exception.decisions.readOnly.evidence, "user-exception");
});

test("原生声明只升级 resume/approval，永不升级 readOnly/fullAccess/questions", () => {
  const base = assessKernelCapabilities({ kernel: "opencode" });
  const merged = mergeAdvertisedCapabilities(
    base,
    { resume: true, approval: true, readOnly: true, fullAccess: true, questions: true },
    "acp-initialize",
  );
  assert.equal(merged.capabilities.resume, true);
  assert.equal(merged.decisions.resume.evidence, "advertised");
  assert.equal(merged.capabilities.approval, true);
  assert.equal(merged.decisions.approval.evidence, "adapter");
  assert.equal(merged.capabilities.readOnly, false);
  assert.equal(merged.capabilities.fullAccess, false);
  assert.equal(merged.capabilities.questions, false);
  assert.equal(merged.decisions.readOnly.evidence, "unsupported");
  // 未核验状态不允许被声明升级。
  const unverified = mergeAdvertisedCapabilities(
    assessKernelCapabilities({ kernel: "codex", version: "0.100.0" }),
    { resume: true, approval: true },
    "acp-initialize",
  );
  assert.equal(unverified.capabilities.resume, false);
  assert.equal(unverified.decisions.resume.evidence, "unverified");
});

test("版本区间判定只接受受支持的形式", () => {
  assert.equal(versionSatisfies("1.2.3", "*"), true);
  assert.equal(versionSatisfies("1.2.3", ">=1.2.3"), true);
  assert.equal(versionSatisfies("1.2.3", ">1.2.3"), false);
  assert.equal(versionSatisfies("2.1.220", ">=2.1.0"), true);
  assert.equal(versionSatisfies("1.0.3", "1.0.3"), true);
  assert.equal(versionSatisfies("not-a-version", "*"), false);
  assert.equal(versionSatisfies("1.2.3", ">=x.y.z"), false);
});

test("远端或其它探测来源缺失 probe 时按旧字段工作", () => {
  const legacy: StudioKernelStatus = {
    id: "codex",
    installed: true,
    origin: "external",
    capabilities: kernelCapabilities("codex"),
  };
  assert.equal(legacy.probe, undefined);
  assert.equal(legacy.installed, true);
});

test("定位失败与租约失败给出不同代码，注册表关闭后不再探测", async () => {
  const f = await workspace();
  const dataDir = join(f.directory, "data");
  try {
    const lease = await inspector({
      dataDir,
      executable: f.executable,
      resolve: async () => {
        throw new Error("另一个内核管理操作正在执行");
      },
    }).inspectOne(opencode);
    assert.equal(lease.probe?.stages.locate.code, "locate.manager-unavailable");
    assert.equal(lease.origin, "missing");

    const closed = await inspector({
      dataDir,
      executable: f.executable,
      disposed: true,
      resolve: async () => {
        throw new Error("Studio 内核注册表已关闭");
      },
    }).inspectOne(opencode);
    assert.equal(closed.installed, false);
    assert.equal(closed.probe?.stages.locate.status, "failed");
    assert.equal(closed.probe?.stages.locate.code, "locate.registry-closed");
  } finally {
    await f.close();
  }
});
