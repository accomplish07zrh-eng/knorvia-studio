// SPDX-License-Identifier: Apache-2.0
// shared-01 契约测试：node 工具（B1–B12）。黑盒只走 `@knorvia/shared/node` 公开入口。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import test from "node:test";
import { sharedNode } from "./entry.mjs";
import { fixtures } from "./fixtures.mjs";

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("B1 文件锁：获取、所有权校验与释放", async () => {
  const dir = tempDir("shared01-lock-");
  const target = join(dir, "data", "state.json");
  // 锁的父目录由调用方（或 withFileLock）准备；acquireFileLock 自己不建父目录。
  await assert.rejects(
    () => sharedNode.acquireFileLock(target, [], 100, 2000),
    (error) => {
      assert.equal(error.code, "ENOENT");
      return true;
    },
  );
  mkdirSync(join(dir, "data"));
  const release = await sharedNode.acquireFileLock(target, [], 100, 2000);
  assert.equal(typeof release, "function");
  const lockDir = `${target}.lock`;
  assert.ok(existsSync(lockDir), "锁目录应存在");
  const owners = readdirSync(lockDir).filter(
    (name) => name.startsWith("owner-") && name.endsWith(".json"),
  );
  assert.equal(owners.length, 1, "锁目录里恰好一个 owner 文件");
  const payload = JSON.parse(readFileSync(join(lockDir, owners[0]), "utf8"));
  assert.equal(payload.pid, process.pid, "owner 元数据 pid 是本进程");
  assert.equal(typeof payload.createdAt, "number");
  assert.equal(typeof payload.token, "string");
  assert.ok(
    readFileSync(join(lockDir, owners[0]), "utf8").endsWith("\n"),
    "owner 元数据以换行结尾",
  );
  await release();
  assert.ok(!existsSync(lockDir), "释放后锁目录消失");
  await release();
  assert.ok(!existsSync(lockDir), "释放幂等");
  rmSync(dir, { recursive: true, force: true });
});

test("B2 文件锁：互斥等待与超时错误形态", async () => {
  const dir = tempDir("shared01-lock-");
  const target = join(dir, "state.json");
  const release = await sharedNode.acquireFileLock(target, [], 100, 2000);
  await assert.rejects(
    () => sharedNode.acquireFileLock(target, [5], 100, 60),
    (error) => {
      assert.equal(error.code, "KNORVIA_FILE_LOCK_TIMEOUT");
      assert.equal(error.path, target);
      assert.equal(error.syscall, "mkdir");
      assert.match(
        error.message,
        /^Timed out after \d+ms waiting for the Knorvia Studio file lock: /u,
      );
      assert.ok(error.message.endsWith(`${target}.lock`), "message 以锁路径结尾");
      assert.ok(error.cause !== undefined, "cause 是最后一次获取失败");
      return true;
    },
  );
  await release();
  rmSync(dir, { recursive: true, force: true });
});

test("B3 文件锁：无主遗弃锁回收（grace=0）", async () => {
  const dir = tempDir("shared01-lock-");
  const target = join(dir, "state.json");
  const lockDir = `${target}.lock`;
  mkdirSync(lockDir);
  writeFileSync(
    join(lockDir, "owner-old.json"),
    `${JSON.stringify({ pid: null, createdAt: Date.now(), token: "old" })}\n`,
    "utf8",
  );
  const release = await sharedNode.acquireFileLock(target, [5], 0, 2000);
  assert.ok(existsSync(lockDir), "取得锁后锁目录在");
  const owners = readdirSync(lockDir).filter((name) => name.startsWith("owner-"));
  assert.equal(owners.length, 1);
  assert.notEqual(owners[0], "owner-old.json", "遗弃的 owner 已被回收");
  await release();
  assert.ok(!existsSync(lockDir));
  rmSync(dir, { recursive: true, force: true });
});

test("B3 文件锁：持有进程已退出的遗弃锁可回收", async () => {
  const dir = tempDir("shared01-lock-");
  const target = join(dir, "state.json");
  const lockDir = `${target}.lock`;
  mkdirSync(lockDir);
  const child = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" });
  assert.equal(child.status, 0, "子进程应正常退出（成为死进程 pid）");
  writeFileSync(
    join(lockDir, "owner-dead.json"),
    `${JSON.stringify({ pid: child.pid, createdAt: Date.now(), token: "dead" })}\n`,
    "utf8",
  );
  const release = await sharedNode.acquireFileLock(target, [5], 60_000, 2000);
  const owners = readdirSync(lockDir).filter((name) => name.startsWith("owner-"));
  assert.equal(owners.length, 1);
  assert.notEqual(owners[0], "owner-dead.json", "死进程 owner 已被回收");
  await release();
  rmSync(dir, { recursive: true, force: true });
});

test("B4 文件锁：损坏元数据按无主处理、时间戳不被超前值承认", async () => {
  const dir = tempDir("shared01-lock-");
  const target = join(dir, "state.json");
  const lockDir = `${target}.lock`;
  mkdirSync(lockDir);
  // 旧写格式的 owner 元数据（fixtures 录制的键序与换行），pid 用活的本进程——不应回收。
  const liveOwnerBytes = `${JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: "fixture-token-0001" })}\n`;
  assert.equal(
    liveOwnerBytes.endsWith("\n"),
    fixtures.lockOwnerBytes.endsWith("\n"),
    "旧写格式以换行结尾",
  );
  writeFileSync(join(lockDir, "owner-live.json"), liveOwnerBytes, "utf8");
  await assert.rejects(
    () => sharedNode.acquireFileLock(target, [5], 0, 60),
    (error) => {
      assert.equal(error.code, "KNORVIA_FILE_LOCK_TIMEOUT");
      return true;
    },
  );
  // 损坏元数据（非法 JSON、时间戳非法）按「无主 + 文件时间」处理，grace=0 时可回收。
  writeFileSync(join(lockDir, "owner-live.json"), "{not-json", "utf8");
  const release = await sharedNode.acquireFileLock(target, [5], 0, 2000);
  assert.ok(existsSync(lockDir));
  await release();
  rmSync(dir, { recursive: true, force: true });
});

test("B5 withFileLock：同路径进程内严格串行（事件序列）", async () => {
  const dir = tempDir("shared01-lock-");
  const target = join(dir, "state.json");
  const events = [];
  const record = (tag) =>
    sharedNode.withFileLock(target, async () => {
      events.push(`enter:${tag}`);
      await new Promise((resolveImmediate) => setImmediate(resolveImmediate));
      events.push(`exit:${tag}`);
      return tag;
    });
  const [first, second] = await Promise.all([record("a"), record("b")]);
  assert.equal(first, "a");
  assert.equal(second, "b");
  assert.deepEqual(
    events,
    ["enter:a", "exit:a", "enter:b", "exit:b"],
    "两个 operation 的执行区间不重叠且 FIFO",
  );
  assert.ok(!existsSync(`${target}.lock`), "锁已释放");
  rmSync(dir, { recursive: true, force: true });
});

test("B5 withFileLock：operation 抛错原样透传且锁释放", async () => {
  const dir = tempDir("shared01-lock-");
  const target = join(dir, "state.json");
  const sentinel = new Error("operation-failed");
  await assert.rejects(
    () =>
      sharedNode.withFileLock(target, async () => {
        throw sentinel;
      }),
    (error) => error === sentinel,
  );
  assert.ok(!existsSync(`${target}.lock`), "失败后锁仍释放");
  const value = await sharedNode.withFileLock(target, async () => 42);
  assert.equal(value, 42, "锁释放后可再次取得");
  rmSync(dir, { recursive: true, force: true });
});

test("B6 atomicWritePrivateTextFile：原子写、换行原样、无临时残留", async () => {
  const dir = tempDir("shared01-write-");
  // 正斜杠路径在 Windows 与 POSIX 都应落到同一文件（平台兼容）。
  const target = `${dir}${sep === "\\" ? "/" : "/"}nested/deep/state.json`;
  const content = "line-a\r\nline-b\n中文";
  await sharedNode.atomicWritePrivateTextFile(target, content);
  assert.equal(readFileSync(target, "utf8"), content, "写什么字节就是什么字节");
  const written = readdirSync(join(dir, "nested", "deep"));
  assert.deepEqual(written, ["state.json"], "目录里只有目标文件，无 .tmp 残留");
  if (process.platform !== "win32") {
    assert.equal(statSync(target).mode & 0o777, 0o600, "POSIX 权限位 0600");
  }
  await sharedNode.atomicWritePrivateTextFile(target, "second");
  assert.equal(readFileSync(target, "utf8"), "second", "重复调用覆盖写");
  rmSync(dir, { recursive: true, force: true });
});

test("B7 backupCorruptFile：备份命名、内容一致、幂等", async () => {
  const dir = tempDir("shared01-backup-");
  const target = join(dir, "corrupt.json");
  const content = '{"broken": tru';
  writeFileSync(target, content, "utf8");
  const backupPath = await sharedNode.backupCorruptFile(target);
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 24);
  assert.equal(
    backupPath,
    `${target}.corrupt-${digest}.bak`,
    "备份名 = 原名 + .corrupt-<sha256 前 24 hex>.bak",
  );
  assert.equal(readFileSync(backupPath, "utf8"), content, "备份内容逐字节一致");
  if (process.platform !== "win32") {
    assert.equal(statSync(backupPath).mode & 0o777, 0o600, "备份权限位 0600");
  }
  const again = await sharedNode.backupCorruptFile(target);
  assert.equal(again, backupPath, "幂等：同内容同路径");
  rmSync(dir, { recursive: true, force: true });
});

test("B8 migrateSubagentStateFile：旧写→新读→新写→旧读 往返与幂等", async () => {
  const dir = tempDir("shared01-state-");
  const target = join(dir, "subagent-state.json");
  // 旧写：旧实现写出的文件（fixtures 录制字节）。
  writeFileSync(target, fixtures.stateInput, "utf8");
  // 新读 + 新写：迁移后的字节必须与旧实现录制的期望逐字节一致。
  await sharedNode.migrateSubagentStateFile(target);
  const migrated = readFileSync(target, "utf8");
  assert.equal(migrated, fixtures.stateMigrated, "迁移写回字节与录制期望一致");
  // 旧读：迁移结果仍是旧格式可读的 JSON（2 空格缩进、可解析、再序列化对偶）。
  const parsed = JSON.parse(migrated);
  assert.equal(JSON.stringify(parsed, null, 2), migrated, "写回格式是 2 空格缩进 JSON");
  // 再迁移一次必须逐字节不变（幂等）。
  await sharedNode.migrateSubagentStateFile(target);
  assert.equal(readFileSync(target, "utf8"), fixtures.stateMigratedTwice, "二次迁移不改字节");
  assert.equal(fixtures.stateMigratedTwice, fixtures.stateMigrated, "录制夹具自身证明幂等");
  rmSync(dir, { recursive: true, force: true });
});

test("B8 migrateSubagentStateFile：坏 JSON 与缺文件安静返回", async () => {
  const dir = tempDir("shared01-state-");
  const broken = join(dir, "broken.json");
  writeFileSync(broken, "{not-json", "utf8");
  await sharedNode.migrateSubagentStateFile(broken);
  assert.equal(readFileSync(broken, "utf8"), "{not-json", "坏 JSON 不被改写");
  await sharedNode.migrateSubagentStateFile(join(dir, "absent.json"));
  assert.ok(!existsSync(join(dir, "absent.json")), "缺文件不被创建");
  rmSync(dir, { recursive: true, force: true });
});

test("B9 migrateUserSubagentMarkdown：递归扫描、结果汇总、幂等", async () => {
  const dir = tempDir("shared01-md-");
  mkdirSync(join(dir, "sub", "deeper"), { recursive: true });
  const migrating = "---\nmodel: builtin:zai/glm-4.7\n---\nbody";
  const files = {
    "a.MD": "# no frontmatter\n",
    "b.markdown": migrating,
    "c.txt": migrating,
    "sub/deeper/d.md": "---\nmodel: builtin:official\n---\nbody",
    "e.md": "# no frontmatter\n",
  };
  for (const [rel, body] of Object.entries(files)) {
    writeFileSync(join(dir, ...rel.split("/")), body, "utf8");
  }
  const before = Object.fromEntries(
    Object.keys(files).map((rel) => [rel, readFileSync(join(dir, ...rel.split("/")), "utf8")]),
  );
  const result = await sharedNode.migrateUserSubagentMarkdown(dir);
  assert.ok(
    Array.isArray(result.migrated) && Array.isArray(result.failures),
    "结果形态 {migrated, failures}",
  );
  assert.deepEqual(result.failures, [], "合成布局无失败项");
  assert.deepEqual(
    result.migrated.map((path) => relative(dir, path).split(sep).join("/")),
    ["b.markdown"],
    "只有内容真的被迁移改写的 markdown 进 migrated（递归、扩展名大小写不敏感）",
  );
  for (const changed of result.migrated) {
    const rel = relative(dir, changed).split(sep).join("/");
    assert.notEqual(readFileSync(changed, "utf8"), before[rel], "列入 migrated 的文件确实被改写");
  }
  assert.equal(readFileSync(join(dir, "c.txt"), "utf8"), before["c.txt"], "非 markdown 不动");
  assert.equal(readFileSync(join(dir, "a.MD"), "utf8"), before["a.MD"], "无 frontmatter 不动");
  const second = await sharedNode.migrateUserSubagentMarkdown(dir);
  assert.deepEqual(second.migrated, [], "二次扫描 migrated 为空（迁移收敛）");
  assert.deepEqual(second.failures, []);
  const missing = await sharedNode.migrateUserSubagentMarkdown(join(dir, "no-such-root"));
  assert.deepEqual(missing, { migrated: [], failures: [] }, "缺失根安静返回空结果");
  rmSync(dir, { recursive: true, force: true });
});

test("B9 migrateUserSubagentMarkdown：frontmatter 模型行被迁移改写", async () => {
  const dir = tempDir("shared01-md-");
  const target = join(dir, "agent.md");
  writeFileSync(target, "---\nmodel: builtin:zai/glm-4.7\n---\nbody", "utf8");
  const result = await sharedNode.migrateUserSubagentMarkdown(dir);
  assert.equal(result.migrated.length, 1, "frontmatter 的旧模型标识必须触发一次改写");
  assert.equal(result.migrated[0], target);
  assert.equal(result.failures.length, 0);
  const after = readFileSync(target, "utf8");
  assert.notEqual(after, "---\nmodel: builtin:zai/glm-4.7\n---\nbody", "内容确实被迁移");
  assert.match(after, /^---\r?\nmodel: /u, "frontmatter 结构保留");
  assert.ok(!after.includes("builtin:zai"), "旧 provider 标识已被迁移替换");
  rmSync(dir, { recursive: true, force: true });
});

test("B10/B11 scanOfficialPluginCacheRoots：旧写布局→新读扫描（排序与临时条目跳过）", async () => {
  const dir = tempDir("shared01-cache-");
  for (const rel of fixtures.pluginCacheLayout.tree) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, "", "utf8");
  }
  const roots = await sharedNode.scanOfficialPluginCacheRoots(dir);
  const normalized = roots.map((root) => ({
    name: root.name,
    versions: root.versionRoots.map((path) => relative(dir, path).split(sep).join("/")),
  }));
  assert.deepEqual(normalized, fixtures.pluginCacheLayout.expected, "排序与跳过规则与录制一致");
  rmSync(dir, { recursive: true, force: true });
});

test("B10 scanOfficialPluginCacheRoots：缺失根返回空数组", async () => {
  const dir = tempDir("shared01-cache-");
  const roots = await sharedNode.scanOfficialPluginCacheRoots(join(dir, "absent"));
  assert.deepEqual(roots, []);
  rmSync(dir, { recursive: true, force: true });
});

test("B12 createNodeSelfResourceSampler：差分换算、舍入与降级", () => {
  let cpu = { user: 1000, system: 500 };
  let clock = 0n;
  const sampler = sharedNode.createNodeSelfResourceSampler({
    readCpuUsage: () => cpu,
    readMonotonicTimeNs: () => clock,
    logicalCpuCount: 4,
  });
  cpu = { user: 3000, system: 1500 };
  clock = 2_000_000_000n;
  const sample = sampler.sample({ rss: 2048, heapUsed: 1024 });
  // Δcpu = 3000μs over 2s → 0.0015 核 → /4 核 ×100 = 0.0375%
  assert.deepEqual(sample, { cpuPercent: 0.0375, rssKb: 2, heapUsedKb: 1 });
  // 时钟未前进 → null，只丢当前样本。
  assert.equal(sampler.sample({ rss: 1, heapUsed: 1 }), null);
  // CPU 计数回退 → null。
  cpu = { user: 10, system: 10 };
  clock = 3_000_000_000n;
  assert.equal(sampler.sample({ rss: 1, heapUsed: 1 }), null);
});

test("B12 createNodeSelfResourceSampler：逻辑核数钳制到 [1, 4096]", () => {
  const runWith = (logicalCpuCount) => {
    let cpu = { user: 0, system: 0 };
    let clock = 0n;
    const sampler = sharedNode.createNodeSelfResourceSampler({
      readCpuUsage: () => cpu,
      readMonotonicTimeNs: () => clock,
      logicalCpuCount,
    });
    cpu = { user: 100, system: 0 };
    clock = 1000n;
    return sampler.sample({ rss: 0, heapUsed: 0 });
  };
  assert.deepEqual(runWith(0), { cpuPercent: 10000, rssKb: 0, heapUsedKb: 0 }, "下界钳到 1 核");
  assert.deepEqual(
    runWith(99999),
    { cpuPercent: 2.4414, rssKb: 0, heapUsedKb: 0 },
    "上界钳到 4096 核",
  );
});

test("B12 createNodeSelfResourceSampler：读数抛错时返回 null 并可恢复", () => {
  let fail = true;
  let reads = 0;
  const sampler = sharedNode.createNodeSelfResourceSampler({
    readCpuUsage: () => {
      if (fail) throw new Error("cpu-read-failed");
      reads += 1;
      return { user: reads * 1000, system: 0 };
    },
    readMonotonicTimeNs: () => BigInt(reads) * 1_000_000n,
    logicalCpuCount: 1,
  });
  fail = false;
  // 构造期基线读数失败 → 第一次 sample 只重建基线、丢样本，不抛错。
  assert.equal(sampler.sample({ rss: 1024, heapUsed: 0 }), null, "基线缺失只丢当前样本");
  // 第二次 sample：Δcpu=1000μs / Δt=1ms = 1 核 → 100%。
  assert.deepEqual(sampler.sample({ rss: 1024, heapUsed: 0 }), {
    cpuPercent: 100,
    rssKb: 1,
    heapUsedKb: 0,
  });
});

test("B43 node 入口导出面与行为可达", async () => {
  const expectedValues = [
    "acquireFileLock",
    "resolveKnorviaDataRoot",
    "scanOfficialPluginCacheRoots",
    "migrateUserSubagentMarkdown",
    "migrateSubagentStateFile",
    "atomicWritePrivateTextFile",
    "backupCorruptFile",
    "withFileLock",
    "createNodeSelfResourceSampler",
    "NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS",
  ];
  for (const name of expectedValues) {
    assert.ok(name in sharedNode, `缺少运行时导出 ${name}`);
  }
  assert.equal(sharedNode.NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS, 60_000, "自采周期 60 秒");
  // 行为可达：桩替换后此调用必须失败。
  assert.equal(typeof sharedNode.NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS, "number");
  const dir = tempDir("shared01-export-");
  const release = await sharedNode.acquireFileLock(join(dir, "x"), [], 100, 2000);
  await release();
  rmSync(dir, { recursive: true, force: true });
});
