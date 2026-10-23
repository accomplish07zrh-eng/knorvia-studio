// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind 合同测试：走**公开插件入口**（apply + handle），端口全部用内存替身。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{behavior,acceptance}.md B1–B12、§4.2
//
// **不碰真实磁盘、不碰真实数据库**（acceptance.md §5）：
//   · FileSystemPort        → InMemoryFileSystem
//   · SessionEventStorePort → InMemoryEventStore
//   · ToolArtifactStorePort → InMemoryArtifactStore（K10：检查点文件清单的载体）

import assert from "node:assert/strict";
import nodePath from "node:path";
import test from "node:test";

import type { Context } from "@deepseek-ai/cordis";
import {
  apply,
  assertWired,
  contentHash,
  ABSENT_HASH,
  REWIND_TOOL_DECLARATIONS,
  PREVIEW_TOOL_NAME,
  APPLY_TOOL_NAME,
  type KnorviaRewindConfig,
  type RewindPluginHandle,
} from "../src/kernel-plugin-rewind/index.js";
import { InMemoryFileSystem, InMemoryEventStore } from "./fixtures/rewind-port-doubles.js";
import { InMemoryArtifactStore } from "./fixtures/rewind-artifact-double.js";
import {
  makeCheckpointEvent,
  makeRewindEvent,
  SESSION_ID,
  WORKSPACE_ROOT,
  MESSAGE_ID,
  type FixtureFile,
} from "./fixtures/rewind-event-builders.js";

// ---------------------------------------------------------------------------
// 装配辅助
// ---------------------------------------------------------------------------

/** 最小 `Context` 替身（本包不在 ctx 上注册钩子，所以只需一个空对象）。 */
const CTX = {} as Context;

/** 一次装配的三件套。 */
interface Mounted {
  readonly handle: RewindPluginHandle;
  readonly fileSystem: InMemoryFileSystem;
  readonly eventStore: InMemoryEventStore;
  readonly artifactStore: InMemoryArtifactStore;
}

/**
 * 装配一个插件实例，并把检查点事件与 artifact 一起 seed。
 *
 * @param checkpoints 要预置的检查点（id + 文件清单）
 * @param files 预置到内存文件系统的「当前状态」
 */
function mount(options: {
  checkpoints?: readonly {
    checkpointId: string;
    files: readonly FixtureFile[];
    corrupt?: boolean;
  }[];
  files?: readonly { path: string; content: string }[];
  workspaceRoot?: string;
  pathModule?: KnorviaRewindConfig["pathModule"];
  logger?: KnorviaRewindConfig["logger"];
  withArtifactStore?: boolean;
}): Mounted {
  const workspaceRoot = options.workspaceRoot ?? WORKSPACE_ROOT;
  const pathModule = options.pathModule ?? nodePath.posix;

  const fileSystem = new InMemoryFileSystem();
  // **⚠️ seed 必须用「端口看到的绝对路径」** ——
  // 因为 `resolvePath` 会把检查点里的相对路径解析成 `<workspaceRoot>/<relative>`，
  // 而端口按绝对路径查。用相对路径 seed 会让 stat 查不到 → 误判成「文件不存在」。
  for (const file of options.files ?? []) {
    fileSystem.seed(pathModule.resolve(workspaceRoot, file.path), file.content);
  }

  const eventStore = new InMemoryEventStore();
  const artifactStore = new InMemoryArtifactStore();
  const events: unknown[] = [];
  for (const checkpoint of options.checkpoints ?? []) {
    const built = makeCheckpointEvent({
      checkpointId: checkpoint.checkpointId,
      files: checkpoint.files,
      ...(checkpoint.corrupt === undefined ? {} : { corrupt: checkpoint.corrupt }),
    });
    events.push(built.event);
    artifactStore.seedForCheckpoint(checkpoint.checkpointId, built.artifact);
  }
  if (events.length > 0) eventStore.seed(events);

  const handle = apply(CTX, {
    fileSystem: fileSystem as never,
    eventStore: eventStore as never,
    workspaceRoot,
    pathModule,
    ...(options.withArtifactStore === false ? {} : { artifactStore: artifactStore as never }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });
  return { handle, fileSystem, eventStore, artifactStore };
}

/** 捕获日志（用于「不泄漏」断言）。 */
function createCapturingLogger() {
  const entries: { level: string; message: string; fields?: Record<string, unknown> }[] = [];
  const push = (level: string) => (message: string, fields?: Record<string, unknown>) => {
    entries.push({ level, message, fields });
  };
  return {
    entries,
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
  };
}

/** 检查点在文件系统里的绝对路径（断言用）。 */
const ABS_A = "/workspace/a.txt";

// ---------------------------------------------------------------------------
// B1 插件形态与依赖注入
// ---------------------------------------------------------------------------

test("B1: missing fileSystem throws and names the field", () => {
  assert.throws(
    () => assertWired({ eventStore: {}, workspaceRoot: "/w" } as never),
    /fileSystem is required/u,
  );
});

test("B1: missing eventStore throws and names the field", () => {
  assert.throws(
    () => assertWired({ fileSystem: {}, workspaceRoot: "/w" } as never),
    /eventStore is required/u,
  );
});

test("B1: missing workspaceRoot throws and refuses to fall back to process.cwd", () => {
  assert.throws(
    () => assertWired({ fileSystem: {}, eventStore: {}, workspaceRoot: "" } as never),
    /workspaceRoot is required/u,
  );
});

test("B1: a missing artifactStore is allowed at assembly time (K10)", () => {
  // artifactStore 是可选端口：装配不该因它缺席而抛错。
  assert.doesNotThrow(() =>
    assertWired({ fileSystem: {}, eventStore: {}, workspaceRoot: "/w" } as never),
  );
});

test("B1: the plugin is engine-agnostic (no KNORVIA_KERNEL_ENGINE read outside comments)", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    new URL("../src/kernel-plugin-rewind/index.ts", import.meta.url),
    "utf8",
  );
  const codeOnly = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  assert.equal(codeOnly.includes("KNORVIA_KERNEL_ENGINE"), false);
});

test("B1: no direct node:fs import in any implementation file (L1)", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const directory = new URL("../src/kernel-plugin-rewind/", import.meta.url);
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith(".ts")) continue;
    const source = readFileSync(new URL(entry, directory), "utf8");
    const codeOnly = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    assert.equal(
      codeOnly.includes('from "node:fs"'),
      false,
      `${entry} must not import node:fs directly (K1)`,
    );
  }
});

// ---------------------------------------------------------------------------
// K3 contentHash 三条边界（数据契约，最高优先级）
// ---------------------------------------------------------------------------

test('K3: contentHash(null) is the literal "missing", not sha256("")', () => {
  assert.equal(contentHash(null), ABSENT_HASH);
  assert.equal(contentHash(null), "missing");
});

test('K3: contentHash("") is sha256 of the empty string, distinct from null', () => {
  assert.equal(contentHash(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.notEqual(contentHash(""), contentHash(null));
});

test('K3: contentHash("abc") matches the known digest', () => {
  assert.equal(
    contentHash("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

// ---------------------------------------------------------------------------
// B2 文件回退预览（只读）
// ---------------------------------------------------------------------------

test("B2: no checkpoint yields an unavailable plan with a reason", async () => {
  const { handle } = mount({});
  const plan = await handle.previewFileRewind({ sessionId: SESSION_ID });
  assert.equal(plan.available, false);
  assert.ok((plan.unavailableReason ?? "").length > 0);
});

test("B2: a file deleted after the checkpoint produces a write operation", async () => {
  // 检查点里有 a.txt，当前文件系统里没有 → 回退要恢复它。
  const { handle } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
  });
  const plan = await handle.previewFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(plan.available, true);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].action, "write");
  assert.equal(plan.operations[0].content, "before");
});

test("B2: a file added after the checkpoint produces a remove operation", async () => {
  // 检查点时该文件不存在（existedBefore: false），当前存在 → 回退要删掉它。
  const { handle } = mount({
    checkpoints: [
      {
        checkpointId: "cp-1",
        files: [{ path: "new.txt", content: null, existedBefore: false }],
      },
    ],
    files: [{ path: "new.txt", content: "created later" }],
  });
  const plan = await handle.previewFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].action, "remove");
});

test("B2: an unchanged file produces no operation", async () => {
  const { handle } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "same" }] }],
    files: [{ path: "a.txt", content: "same" }],
  });
  const plan = await handle.previewFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(plan.operations.length, 0);
});

test("B2: preview never writes (L2)", async () => {
  const { handle, fileSystem } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
    files: [{ path: "a.txt", content: "changed" }],
  });
  await handle.previewFileRewind({ sessionId: SESSION_ID, targetCheckpointId: "cp-1" });
  assert.equal(fileSystem.writeCount, 0, "preview must not write");
  assert.equal(fileSystem.removeCount, 0, "preview must not remove");
});

// ---------------------------------------------------------------------------
// B3 文件回退执行
// ---------------------------------------------------------------------------

test("B3: a normal rewind writes the checkpoint content back", async () => {
  const { handle, fileSystem } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
    files: [{ path: "a.txt", content: "changed" }],
  });
  const result = await handle.applyFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(result.applied, 1);
  assert.equal(result.partial, false);
  assert.equal(fileSystem.read(ABS_A), "before");
});

test("B3: drift is rejected before any write (K7)", async () => {
  const { fileSystem } = mount({});
  fileSystem.seed(ABS_A, "edited by user");

  const { applyFileRewind, createInFlightRegistry } =
    await import("../src/kernel-plugin-rewind/file-rewind-apply.js");
  // 手工构造「陈旧的 expectedHash」→ 模拟「preview 之后用户编辑了文件」。
  const stalePlan = [
    {
      path: "a.txt",
      action: "write" as const,
      content: "before",
      expectedHash: contentHash("original"),
      reason: "fixture",
    },
  ];
  const result = await applyFileRewind(
    "cp-1",
    stalePlan,
    {
      fileSystem: fileSystem as never,
      resolvePath: (relative) => `/workspace/${relative}`,
      newRewindId: () => "rewind-fixture",
    },
    createInFlightRegistry(),
  );
  assert.equal(result.applied, 0);
  assert.ok((result.unavailableReason ?? "").includes("changed since preview"));
  assert.equal(fileSystem.read(ABS_A), "edited by user", "the user edit must be preserved");
  assert.equal(fileSystem.writeCount, 0, "a rejected rewind must not write");
});

test("B3: a port failure triggers compensation and rolls back (B4/K6)", async () => {
  const { handle, fileSystem } = mount({
    checkpoints: [
      {
        checkpointId: "cp-1",
        files: [
          { path: "a.txt", content: "before-a" },
          { path: "b.txt", content: "before-b" },
        ],
      },
    ],
    files: [
      { path: "a.txt", content: "current-a" },
      { path: "b.txt", content: "current-b" },
    ],
  });
  // 第 2 次写抛错 → 触发补偿。
  fileSystem.failWriteOnAttempt(2);
  const result = await handle.applyFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });

  assert.equal(result.partial, true);
  assert.equal(result.applied, 0, "a rolled-back rewind reports zero applied");
  assert.equal(result.failures.length, 1);
  assert.equal(fileSystem.read(ABS_A), "current-a", "step 1 must be rolled back");
});

test("B3: repeated apply is a no-op (B10)", async () => {
  const { handle, fileSystem } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
    files: [{ path: "a.txt", content: "changed" }],
  });
  const first = await handle.applyFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(first.applied, 1);
  const writesAfterFirst = fileSystem.writeCount;

  const second = await handle.applyFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  // **幂等的实现方式**：第二次生成计划时，文件已等于检查点内容
  // → 计划里**没有任何操作**（operations 为空）→ applied 0、skipped 0。
  // 这比「计划里仍有条目但被跳过」更彻底：连计划都不产生操作。
  assert.equal(second.applied, 0, "the second apply must not write anything");
  assert.equal(second.partial, false);
  assert.equal(fileSystem.writeCount, writesAfterFirst, "no extra writes on the second apply");
  assert.equal(fileSystem.read(ABS_A), "before", "content stays at the checkpoint state");
});

// ---------------------------------------------------------------------------
// B6 漂移检测细节
// ---------------------------------------------------------------------------

test("B6: a deleted file is treated as 'needs restore', not as drift", async () => {
  const { handle, fileSystem } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
  });
  const result = await handle.applyFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(result.applied, 1);
  assert.equal(fileSystem.read(ABS_A), "before");
});

// ---------------------------------------------------------------------------
// B7 会话回退只规划（不 fork）
// ---------------------------------------------------------------------------

test("B7: a rewindable message yields a target sequence number", async () => {
  const eventStore = new InMemoryEventStore();
  eventStore.seed([
    makeRewindEvent({ sequenceNumber: 1, messageId: MESSAGE_ID }),
    makeRewindEvent({ sequenceNumber: 2, messageId: "other" }),
  ]);
  const handle = apply(CTX, {
    fileSystem: new InMemoryFileSystem() as never,
    eventStore: eventStore as never,
    workspaceRoot: WORKSPACE_ROOT,
    pathModule: nodePath.posix,
  });
  const plan = await handle.planConversationRewind({
    sessionId: SESSION_ID,
    targetMessageId: MESSAGE_ID,
  });
  assert.equal(plan.available, true);
  assert.equal(plan.targetSequenceNumber, 1);
});

test("B7: an unknown message is unavailable with a reason", async () => {
  const { handle } = mount({});
  const plan = await handle.planConversationRewind({
    sessionId: SESSION_ID,
    targetMessageId: "missing-message",
  });
  assert.equal(plan.available, false);
  assert.equal(plan.targetStatus, "missing");
});

test("B7: no implementation file calls session.fork (L5)", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const directory = new URL("../src/kernel-plugin-rewind/", import.meta.url);
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith(".ts")) continue;
    const source = readFileSync(new URL(entry, directory), "utf8");
    // 只看可执行代码：去掉块注释与行注释后再检查 `.fork(`。
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    assert.equal(codeOnly.includes(".fork("), false, `${entry} must not call fork (L5)`);
  }
});

// ---------------------------------------------------------------------------
// B8 检查点事件（事件即事实）
// ---------------------------------------------------------------------------

test("B8: listing checkpoints reads events and never appends", async () => {
  // artifact 的 `files` 数组 schema 要求 `.min(1)`（至少 1 个文件），
  // 所以夹具不能传空数组 —— 这与「真实检查点总对应至少一次文件变更」一致。
  const oneFile = [{ path: "a.txt", content: "before" }] as const;
  const { handle, eventStore } = mount({
    checkpoints: [
      { checkpointId: "cp-1", files: oneFile },
      { checkpointId: "cp-2", files: oneFile },
    ],
  });
  const list = await handle.listCheckpoints({ sessionId: SESSION_ID });
  assert.equal(list.length, 2);
  assert.equal(eventStore.appendCount, 0, "listing must not append");
});

test("B8: a malformed historical event is skipped, not fatal (K8.1)", async () => {
  const oneFile = [{ path: "a.txt", content: "before" }] as const;
  const { handle } = mount({
    checkpoints: [
      { checkpointId: "cp-good", files: oneFile },
      { checkpointId: "cp-bad", files: oneFile, corrupt: true },
    ],
  });
  const list = await handle.listCheckpoints({ sessionId: SESSION_ID });
  assert.equal(list.length, 1, "the corrupt event must be skipped");
  assert.equal(list[0].checkpointId, "cp-good");
});

test("B8: listing checkpoints does not need the artifact store (K10)", async () => {
  const { handle, artifactStore } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
    withArtifactStore: false,
  });
  const list = await handle.listCheckpoints({ sessionId: SESSION_ID });
  assert.equal(list.length, 1, "listing works without the artifact store");
  assert.equal(artifactStore.readCount, 0);
});

// ---------------------------------------------------------------------------
// K10 artifact store 缺失时的行为
// ---------------------------------------------------------------------------

test("K10: a missing artifact store makes preview unavailable, not empty", async () => {
  const { handle } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
    files: [{ path: "a.txt", content: "changed" }],
    withArtifactStore: false,
  });
  const plan = await handle.previewFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(plan.available, false);
  assert.ok((plan.unavailableReason ?? "").includes("artifact store is not configured"));
});

test("K10: a missing artifact store blocks apply with zero writes", async () => {
  const { handle, fileSystem } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
    files: [{ path: "a.txt", content: "changed" }],
    withArtifactStore: false,
  });
  const result = await handle.applyFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(result.applied, 0);
  assert.ok((result.unavailableReason ?? "").includes("artifact store is not configured"));
  assert.equal(fileSystem.writeCount, 0, "no writes when the artifact store is missing");
});

// ---------------------------------------------------------------------------
// B9 失败语义（fail closed）
// ---------------------------------------------------------------------------

test("B9: a throwing event store fails the call instead of reporting success", async () => {
  const { handle, eventStore } = mount({});
  eventStore.failGetEvents();
  await assert.rejects(() => handle.listCheckpoints({ sessionId: SESSION_ID }));
});

test("B9: an unreadable file state makes the plan unavailable, not empty", async () => {
  const { handle, fileSystem } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
  });
  fileSystem.failStat();
  const plan = await handle.previewFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(plan.available, false);
  assert.ok((plan.unavailableReason ?? "").includes("cannot read"));
});

// ---------------------------------------------------------------------------
// B10 并发与重入
// ---------------------------------------------------------------------------

test("B10: concurrent applies on the same checkpoint reject the second one", async () => {
  const { handle } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
    files: [{ path: "a.txt", content: "changed" }],
  });
  const [first, second] = await Promise.all([
    handle.applyFileRewind({ sessionId: SESSION_ID, targetCheckpointId: "cp-1" }),
    handle.applyFileRewind({ sessionId: SESSION_ID, targetCheckpointId: "cp-1" }),
  ]);
  const rejected = [first, second].filter((item) =>
    (item.unavailableReason ?? "").includes("in progress"),
  );
  assert.equal(rejected.length, 1, "exactly one of the two concurrent applies must be rejected");
});

// ---------------------------------------------------------------------------
// B11 跨平台
// ---------------------------------------------------------------------------

test("B11: paths are composed through the injected path module", async () => {
  const { handle, fileSystem } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
    files: [{ path: "a.txt", content: "changed" }],
    workspaceRoot: "C:\\workspace",
    pathModule: nodePath.win32,
  });
  const result = await handle.applyFileRewind({
    sessionId: SESSION_ID,
    targetCheckpointId: "cp-1",
  });
  assert.equal(result.applied, 1);
  assert.equal(fileSystem.read("C:\\workspace\\a.txt"), "before");
});

// ---------------------------------------------------------------------------
// B12 工具声明
// ---------------------------------------------------------------------------

test("B12: the apply tool is destructive, workspace-scoped, high risk and needs approval", () => {
  const declaration = REWIND_TOOL_DECLARATIONS.find((item) => item.name === APPLY_TOOL_NAME);
  assert.ok(declaration !== undefined);
  assert.equal(declaration.destructive, true);
  assert.equal(declaration.sideEffectScope, "workspace");
  assert.equal(declaration.riskLevel, "high");
  assert.equal(declaration.needsApproval, true);
});

test("B12: the preview tool is read-only and needs no approval", () => {
  const declaration = REWIND_TOOL_DECLARATIONS.find((item) => item.name === PREVIEW_TOOL_NAME);
  assert.ok(declaration !== undefined);
  assert.equal(declaration.readOnly, true);
  assert.equal(declaration.destructive, false);
  assert.equal(declaration.needsApproval, false);
});

// ---------------------------------------------------------------------------
// B11（补充）不泄漏
// ---------------------------------------------------------------------------

test("B11: file contents never leak into log fields", async () => {
  const captured = createCapturingLogger();
  const secret = "SUPER-SECRET-CONTENT-MARKER";
  const { handle } = mount({
    checkpoints: [{ checkpointId: "cp-1", files: [{ path: "a.txt", content: "before" }] }],
    files: [{ path: "a.txt", content: secret }],
    logger: captured.logger,
  });
  await handle.applyFileRewind({ sessionId: SESSION_ID, targetCheckpointId: "cp-1" });
  const serialized = JSON.stringify(captured.entries);
  assert.equal(serialized.includes(secret), false, "file content must not appear in logs");
});
