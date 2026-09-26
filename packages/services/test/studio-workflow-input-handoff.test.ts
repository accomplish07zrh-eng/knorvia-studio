import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";

/**
 * 跨隔离输入交接（见 `specs/knorvia-host-references.md`「跨隔离输入」）。
 *
 * 上游隔离工作区位于 Studio 自己的数据目录里，通用 `importFile` 刻意拒绝导入它。
 * `importReference` 是**窄范围**入口：来源由 `(sourceRunId, sourceStepId, relativePath)`
 * 从上游工作区元数据解析，调用方不能传任意绝对路径。
 *
 * 这里用真实工作区管理器，验收四点：下游读到正确副本、源文件不被下游改动、
 * 引用变化会拒绝、恢复不重复导入。
 */

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-input-handoff-"));
  const project = join(root, "project");
  const dataDir = join(root, "studio-data");
  await mkdir(project, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(project, "README.md"), "baseline\n", "utf8");
  const manager = createStudioWorkspaceManager(dataDir);
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  return { root, project, dataDir, manager };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

/** 造一对上游/下游隔离工作区，并在上游写出一份"上游产出"。 */
async function pair(f: Fixture, body = "清单正文\n") {
  const upstream = await f.manager.prepare({
    runId: "run-a",
    stepId: "step-a",
    sourcePath: f.project,
    mode: "isolated",
  });
  await mkdir(join(upstream, "out"), { recursive: true });
  await writeFile(join(upstream, "out", "inventory.md"), body, "utf8");
  const downstream = await f.manager.prepare({
    runId: "run-b",
    stepId: "step-b",
    sourcePath: f.project,
    mode: "isolated",
  });
  return { upstream, downstream, relative: "out/inventory.md", hash: sha256(body) };
}

test("importReference copies a verified upstream output into the downstream workspace", async (t) => {
  const f = await fixture(t);
  const { upstream, downstream, relative, hash } = await pair(f);
  const upstreamBefore = await readFile(join(upstream, relative), "utf8");

  const receipt = await f.manager.importReference!({
    runId: "run-b",
    stepId: "step-b",
    sourceRunId: "run-a",
    sourceStepId: "step-a",
    relativePath: relative,
    expectedSha256: hash,
  });

  assert.equal(receipt.path, relative, "副本放回同一相对路径，提示词里的路径在下游依然有效");
  assert.equal(receipt.hash, hash);
  assert.equal(await readFile(join(downstream, relative), "utf8"), "清单正文\n");
  // 源文件在导入后逐字未变（导入是复制，不是移动或改写）。
  assert.equal(await readFile(join(upstream, relative), "utf8"), upstreamBefore);
});

test("the downstream edit never reaches the upstream copy", async (t) => {
  const f = await fixture(t);
  const { upstream, downstream, relative, hash } = await pair(f);
  await f.manager.importReference!({
    runId: "run-b",
    stepId: "step-b",
    sourceRunId: "run-a",
    sourceStepId: "step-a",
    relativePath: relative,
    expectedSha256: hash,
  });

  // 下游改自己工作区里的副本：上游必须保持原样。
  await writeFile(join(downstream, relative), "下游改写\n", "utf8");
  assert.equal(await readFile(join(downstream, relative), "utf8"), "下游改写\n");
  assert.equal(await readFile(join(upstream, relative), "utf8"), "清单正文\n");
});

test("a changed upstream output is rejected instead of being handed downstream", async (t) => {
  const f = await fixture(t);
  const { upstream, relative, hash } = await pair(f);
  // 上游产出在记录之后被改动。
  await writeFile(join(upstream, relative), "被改过的内容\n", "utf8");

  await assert.rejects(
    f.manager.importReference!({
      runId: "run-b",
      stepId: "step-b",
      sourceRunId: "run-a",
      sourceStepId: "step-a",
      relativePath: relative,
      expectedSha256: hash,
    }),
    /changed since it was recorded/,
  );
});

test("a missing upstream output is rejected", async (t) => {
  const f = await fixture(t);
  const { relative, hash } = await pair(f);
  await assert.rejects(
    f.manager.importReference!({
      runId: "run-b",
      stepId: "step-b",
      sourceRunId: "run-a",
      sourceStepId: "step-a",
      relativePath: `out/missing-${relative}`,
      expectedSha256: hash,
    }),
    /does not exist/,
  );
});

test("re-importing an unchanged output is idempotent (no duplicate write)", async (t) => {
  const f = await fixture(t);
  const { downstream, relative, hash } = await pair(f);
  const request = {
    runId: "run-b",
    stepId: "step-b",
    sourceRunId: "run-a",
    sourceStepId: "step-a",
    relativePath: relative,
    expectedSha256: hash,
  };
  await f.manager.importReference!(request);
  const first = await readFile(join(downstream, relative), "utf8");
  const second = await f.manager.importReference!(request);

  assert.equal(second.hash, hash);
  assert.equal(await readFile(join(downstream, relative), "utf8"), first);
});

test("importReference never accepts a relative path that escapes the workspace", async (t) => {
  const f = await fixture(t);
  const { hash } = await pair(f);
  await assert.rejects(
    f.manager.importReference!({
      runId: "run-b",
      stepId: "step-b",
      sourceRunId: "run-a",
      sourceStepId: "step-a",
      relativePath: "../escape.md",
      expectedSha256: hash,
    }),
    /Unsafe workspace path/,
  );
});

test("an existing different file in the destination is never overwritten", async (t) => {
  const f = await fixture(t);
  const { downstream, relative, hash } = await pair(f);
  // 目标工作区在该相对路径上已有别的内容（例如下游自己新增的），导入必须失败而不是覆盖。
  await mkdir(join(downstream, "out"), { recursive: true });
  await writeFile(join(downstream, relative), "下游自己的内容\n", "utf8");

  await assert.rejects(
    f.manager.importReference!({
      runId: "run-b",
      stepId: "step-b",
      sourceRunId: "run-a",
      sourceStepId: "step-a",
      relativePath: relative,
      expectedSha256: hash,
    }),
  );
  assert.equal(await readFile(join(downstream, relative), "utf8"), "下游自己的内容\n");
});

test("the generic importFile still refuses Studio's own storage as an input", async (t) => {
  const f = await fixture(t);
  const { upstream, relative } = await pair(f);
  // 通用入口对内部存储的限制保持不变：窄范围入口不是把整个数据目录放开。
  await assert.rejects(
    f.manager.importFile!({
      runId: "run-b",
      stepId: "step-b",
      sourcePath: join(upstream, relative),
      name: "inventory.md",
    }),
    /storage cannot be imported/,
  );
});
