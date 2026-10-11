// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同测试：mailbox / skills / pdf / workflow / barrel（B125–B133）。
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { load, repoRoot } from "./entry.mjs";

const mailbox = await load("mailbox/index");
const skills = await load("skills/index");
const skillRoots = await load("skills/roots");
const scan = await load("skills/scan");
const pdf = await load("pdf/index");
const workflow = await load("workflow/index");
const provider = await load("provider/index");
const rootBarrel = await load("index");

async function tempDir(t, prefix = "knorvia-contract-misc-") {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  return directory;
}

test("B125 会话信箱的目录迁移语义", async (t) => {
  const rootDir = await tempDir(t);
  const unread = join(rootDir, "sess_x", "unread");
  const read = join(rootDir, "sess_x", "read");
  await mkdir(unread, { recursive: true });
  await writeFile(
    join(unread, "a.json"),
    JSON.stringify({
      version: 1,
      messageId: "m1",
      fromSessionId: "sess_a",
      toSessionId: "sess_x",
      content: "hi",
      createdAt: "2026-01-02T00:00:00.000Z",
    }),
  );
  await writeFile(
    join(unread, "b.json"),
    JSON.stringify({
      version: 1,
      messageId: "m2",
      fromSessionId: "sess_a",
      toSessionId: "sess_x",
      content: "yo",
      createdAt: "2026-01-02T00:00:01.000Z",
    }),
  );
  await writeFile(join(unread, "c.txt"), "ignored");
  const adapter = mailbox.createNodeSessionMailboxAdapter({ rootDir });
  const drained = await adapter.drainUnread({ sessionId: "sess_x" });
  assert.deepEqual(
    drained.map((envelope) => envelope.messageId),
    ["m1", "m2"],
  );
  assert.deepEqual((await (await import("node:fs/promises")).readdir(read)).sort(), [
    "a.json",
    "b.json",
  ]);
  assert.deepEqual(await (await import("node:fs/promises")).readdir(unread), ["c.txt"]);
  await writeFile(
    join(unread, "d.json"),
    JSON.stringify({
      version: 1,
      messageId: "m3",
      fromSessionId: "sess_a",
      toSessionId: "sess_x",
      content: "again",
      createdAt: "2026-01-02T00:00:02.000Z",
    }),
  );
  const limited = await adapter.drainUnread({ sessionId: "sess_x", limit: 1 });
  assert.deepEqual(
    limited.map((envelope) => envelope.messageId),
    ["m3"],
  );
  assert.deepEqual(await adapter.drainUnread({ sessionId: "sess_x" }), []);
  await assert.rejects(
    () => adapter.drainUnread({ sessionId: "bad" }),
    (error) => error.message === "Invalid session id: bad",
  );
  await writeFile(join(unread, "e.json"), JSON.stringify({ version: 2 }));
  await assert.rejects(
    () => adapter.drainUnread({ sessionId: "sess_x" }),
    (error) => error.message === "Invalid session mailbox envelope",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() =>
    adapter.drainUnread({ sessionId: "sess_x" }, { signal: controller.signal }),
  );
});

test("B126 技能根发现（与 commands 同构，但 ~/ 用真实 homedir）", async (t) => {
  const home = await tempDir(t);
  const project = await tempDir(t, "knorvia-contract-proj-");
  await mkdir(join(project, ".git"), { recursive: true });
  const nested = join(project, "a", "b");
  await mkdir(nested, { recursive: true });
  const roots = await skillRoots.resolveDefaultSkillRoots(nested, { homeDirectory: home });
  assert.deepEqual(
    roots.slice(0, 2).map((item) => item.path),
    [join(home, ".knorvia-studio", "skills"), join(home, ".agents", "skills")],
  );
  assert.deepEqual(
    roots.map((item) => item.priority),
    roots.map((_, index) => (index + 1) * 10),
  );
  assert.equal(
    roots.some((item) => item.path === join(project, ".knorvia-studio", "skills")),
    true,
  );
  const excluded = await skillRoots.resolveDefaultSkillRoots(nested, {
    homeDirectory: home,
    includeKnorviaSkills: false,
  });
  assert.deepEqual(excluded, []);
  const withExtra = await skillRoots.resolveDefaultSkillRoots(nested, {
    homeDirectory: home,
    includeKnorviaSkills: false,
    extraRoots: ["~/skills", "rel/skills"],
  });
  const { homedir } = await import("node:os");
  assert.equal(withExtra[0].path, join(homedir(), "skills"));
  assert.equal(withExtra[1].path, join(nested, "rel", "skills"));
  const extraResolved = { path: join(home, "extra"), scope: "user", source: "agents", priority: 3 };
  const appended = await skillRoots.resolveDefaultSkillRoots(nested, {
    homeDirectory: home,
    includeKnorviaSkills: false,
    extraResolvedRoots: [extraResolved],
  });
  assert.equal(appended.at(-1), extraResolved);
});

test("B127 技能目录扫描（异步与同步同结果）", async (t) => {
  const rootDir = await tempDir(t);
  await writeFile(join(rootDir, "SKILL.md"), "root skill");
  await mkdir(join(rootDir, "alpha"), { recursive: true });
  await writeFile(join(rootDir, "alpha", "SKILL.md"), "alpha");
  await mkdir(join(rootDir, "beta"), { recursive: true });
  await writeFile(join(rootDir, "beta", "readme.md"), "not a skill");
  const asyncFiles = await scan.scanSkillFilesUnderRoot(rootDir);
  assert.deepEqual(
    asyncFiles.sort(),
    [join(rootDir, "alpha", "SKILL.md"), join(rootDir, "SKILL.md")].sort(),
  );
  assert.deepEqual(scan.scanSkillFilesUnderRootSync(rootDir).sort(), asyncFiles.sort());
  assert.deepEqual(await scan.scanSkillFilesUnderRoot(join(rootDir, "missing")), []);
  assert.deepEqual(await scan.scanSkillFilesUnderRoot(join(rootDir, "SKILL.md")), []);
  const linked = join(rootDir, "link");
  try {
    const { symlink } = await import("node:fs/promises");
    await symlink(rootDir, linked, "dir");
  } catch {
    return;
  }
  assert.deepEqual(await scan.scanSkillFilesUnderRoot(linked, { followSymbolicLinks: false }), []);
  assert.equal(
    (await scan.scanSkillFilesUnderRoot(linked, { followSymbolicLinks: true })).length > 0,
    true,
  );
});

test("B128 技能元数据解析、发现与加载", async (t) => {
  const rootDir = await tempDir(t);
  await mkdir(join(rootDir, "alpha"), { recursive: true });
  await writeFile(
    join(rootDir, "alpha", "SKILL.md"),
    [
      "---",
      "name: Alpha Skill",
      "description: does things",
      "when_to_use: >",
      "  first line",
      "  second line",
      "",
      "  next paragraph",
      "extra: 1",
      "---",
      "# Body",
      "",
      "Content here",
    ].join("\n"),
  );
  await mkdir(join(rootDir, "no-description"), { recursive: true });
  await writeFile(join(rootDir, "no-description", "SKILL.md"), "---\nname: no-desc\n---\n");
  await mkdir(join(rootDir, "plain"), { recursive: true });
  await writeFile(join(rootDir, "plain", "SKILL.md"), "no frontmatter body");
  await mkdir(join(rootDir, "bad-line"), { recursive: true });
  await writeFile(join(rootDir, "bad-line", "SKILL.md"), "---\nname: bad\nnocolon\n---\nbody");
  const adapter = skills.createNodeSkillAdapter();
  const roots = [{ path: rootDir, scope: "project", source: "knorvia", priority: 10 }];
  const outcome = await adapter.discoverSkills({ workingDirectory: rootDir, roots });
  const alpha = outcome.skills.find((skill) => skill.name === "Alpha Skill");
  assert.equal(alpha.description, "does things");
  assert.equal(alpha.whenToUse, "first line second line\nnext paragraph");
  assert.equal(alpha.safeToAutoLoad, false);
  assert.equal(alpha.policy.allowImplicitInvocation, true);
  assert.equal(alpha.frontmatterKeys.includes("extra"), true);
  assert.equal(
    outcome.diagnostics.some((item) => item.code === "skill_missing_description"),
    true,
  );
  assert.equal(
    outcome.diagnostics.some(
      (item) => item.code === "skill_invalid_frontmatter" && item.severity === "warning",
    ),
    true,
  );
  const plain = outcome.skills.find((skill) => skill.name === "plain");
  assert.equal(plain.description, "");
  assert.equal(plain.safeToAutoLoad, true);
  assert.equal(
    outcome.skills.some((skill) => skill.name === "no-desc"),
    false,
  );
  assert.equal(outcome.totalDiscovered, 2);
  const loaded = await adapter.loadSkill({ name: "Alpha Skill", workingDirectory: rootDir, roots });
  assert.equal(loaded.content, "# Body\n\nContent here");
  assert.equal(loaded.baseDirectory, join(rootDir, "alpha"));
  const truncated = await adapter.loadSkill({
    name: "Alpha Skill",
    workingDirectory: rootDir,
    roots,
    maxBytes: 10,
  });
  assert.equal(truncated.truncated, true);
  await assert.rejects(
    () => adapter.loadSkill({ name: "missing", workingDirectory: rootDir, roots }),
    (error) => error.message === "Skill not found: missing",
  );
  const disabled = skills.createNodeSkillAdapter({
    disabledPaths: [join(rootDir, "plain", "SKILL.md")],
  });
  const filtered = await disabled.discoverSkills({ workingDirectory: rootDir, roots });
  assert.equal(
    filtered.skills.some((skill) => skill.name === "plain"),
    false,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      adapter.discoverSkills({ workingDirectory: rootDir, roots }, { signal: controller.signal }),
    (error) => error.message === "Skill operation cancelled",
  );
  const pluginRoot = join(rootDir, "plugin-skills");
  await mkdir(join(pluginRoot, "beta"), { recursive: true });
  await writeFile(
    join(pluginRoot, "beta", "SKILL.md"),
    "---\nname: beta\ndescription: b\n---\nbody",
  );
  await mkdir(join(rootDir, ".knorvia-plugin"), { recursive: true });
  await writeFile(
    join(rootDir, ".knorvia-plugin", "plugin.json"),
    JSON.stringify({ name: "fixture-plugin" }),
  );
  const pluginOutcome = await adapter.discoverSkills({
    workingDirectory: rootDir,
    roots: [
      {
        path: pluginRoot,
        scope: "user",
        source: "plugin",
        priority: 5,
        pluginId: "fixture-plugin",
      },
    ],
  });
  assert.equal(pluginOutcome.skills[0].pluginName, "fixture-plugin");
  assert.equal(pluginOutcome.skills[0].qualifiedName, "fixture-plugin:beta");
  assert.equal(pluginOutcome.skills[0].pluginId, "fixture-plugin");
});

test("B129 PDF 渲染适配器", async (t) => {
  const tempRoot = await tempDir(t);
  const calls = [];
  const executionPort = {
    run: async (request) => {
      calls.push(request.command);
      if (request.command.file === "pdfinfo") {
        return {
          cancelled: false,
          exitCode: 0,
          status: "completed",
          stderr: { text: "" },
          stdout: { text: "Pages:           12\n" },
        };
      }
      if (request.command.args.includes("-v")) {
        return {
          cancelled: false,
          exitCode: 0,
          status: "completed",
          stderr: { text: "" },
          stdout: { text: "pdftoppm version 1\n" },
        };
      }
      const prefix = request.command.args.at(-1);
      await writeFile(`${prefix}-1.jpg`, Buffer.from([1, 2, 3]));
      await writeFile(`${prefix}-2.jpg`, Buffer.from([4, 5]));
      return {
        cancelled: false,
        exitCode: 0,
        status: "completed",
        stderr: { text: "" },
        stdout: { text: "" },
      };
    },
  };
  const adapter = pdf.createPopplerPdfDocumentAdapter({ executionPort, tempRoot });
  assert.equal(await adapter.getPageCount({ filePath: join(tempRoot, "doc.pdf"), trace: "t" }), 12);
  const pages = await adapter.renderPages({
    filePath: join(tempRoot, "doc.pdf"),
    firstPage: 1,
    lastPage: 2,
    trace: "t",
  });
  assert.deepEqual(
    pages.map((page) => page.pageNumber),
    [1, 2],
  );
  assert.equal(pages[0].mediaType, "image/jpeg");
  assert.equal(pages[0].data instanceof Uint8Array, true);
  const renderedArgs = calls.filter(
    (command) => command.file === "pdftoppm" && command.args.includes("-jpeg"),
  )[0].args;
  assert.deepEqual(renderedArgs.slice(0, 6), ["-jpeg", "-r", "100", "-f", "1", "-l"]);
  const unavailable = pdf.createPopplerPdfDocumentAdapter({
    executionPort: {
      run: async () => ({
        cancelled: false,
        exitCode: 127,
        status: "failed",
        stderr: { text: "" },
        stdout: { text: "" },
      }),
    },
    tempRoot,
  });
  await assert.rejects(
    () =>
      unavailable.renderPages({
        filePath: join(tempRoot, "doc.pdf"),
        firstPage: 1,
        lastPage: 1,
        trace: "t",
      }),
    (error) =>
      error.code === "unavailable" &&
      error.message ===
        "pdftoppm is not installed. Install poppler-utils (e.g. `brew install poppler` or `apt-get install poppler-utils`) to enable PDF page rendering.",
  );
  const passwordProtected = pdf.createPopplerPdfDocumentAdapter({
    executionPort: {
      run: async (request) => {
        if (request.command.args.includes("-v")) {
          return {
            cancelled: false,
            exitCode: 0,
            status: "completed",
            stderr: { text: "" },
            stdout: { text: "v" },
          };
        }
        return {
          cancelled: false,
          exitCode: 1,
          status: "failed",
          stderr: { text: "Error: PDF is password protected" },
          stdout: { text: "" },
        };
      },
    },
    tempRoot,
  });
  await assert.rejects(
    () =>
      passwordProtected.renderPages({
        filePath: join(tempRoot, "doc.pdf"),
        firstPage: 1,
        lastPage: 1,
        trace: "t",
      }),
    (error) => error.code === "password_protected",
  );
  const outOfRange = pdf.createPopplerPdfDocumentAdapter({
    executionPort: {
      run: async (request) => {
        if (request.command.args.includes("-v")) {
          return {
            cancelled: false,
            exitCode: 0,
            status: "completed",
            stderr: { text: "" },
            stdout: { text: "v" },
          };
        }
        return {
          cancelled: false,
          exitCode: 1,
          status: "failed",
          stderr: {
            text: "Wrong page range given: the first page (5) can not be after the last page (3)",
          },
          stdout: { text: "" },
        };
      },
    },
    tempRoot,
  });
  await assert.rejects(
    () =>
      outOfRange.renderPages({
        filePath: join(tempRoot, "doc.pdf"),
        firstPage: 5,
        lastPage: 6,
        trace: "t",
      }),
    (error) => error.code === "page_out_of_range" && error.message.includes("PDF has 3 pages"),
  );
  const emptyOutput = pdf.createPopplerPdfDocumentAdapter({
    executionPort: {
      run: async (request) => {
        if (request.command.args.includes("-v")) {
          return {
            cancelled: false,
            exitCode: 0,
            status: "completed",
            stderr: { text: "" },
            stdout: { text: "v" },
          };
        }
        return {
          cancelled: false,
          exitCode: 0,
          status: "completed",
          stderr: { text: "" },
          stdout: { text: "" },
        };
      },
    },
    tempRoot,
  });
  await assert.rejects(
    () =>
      emptyOutput.renderPages({
        filePath: join(tempRoot, "doc.pdf"),
        firstPage: 1,
        lastPage: 1,
        trace: "t",
      }),
    (error) =>
      error.code === "corrupted" &&
      error.message === "pdftoppm produced no output pages. The PDF may be invalid.",
  );
  const tempLeftovers = (await (await import("node:fs/promises")).readdir(tempRoot)).filter(
    (name) => name.startsWith("knorvia-read-pdf-"),
  );
  assert.deepEqual(tempLeftovers, []);
});

test("B130/B131 工作流 run 侧与定义存储", async (t) => {
  const rootDir = await tempDir(t);
  const store = workflow.createNodeWorkflowStore({ rootDir });
  assert.equal(await store.readRun("missing"), null);
  assert.deepEqual(await store.readEvents("missing"), []);
  assert.deepEqual(await store.listRuns(), []);
  const event = {
    kind: "expert",
    runId: "run-1",
    timestamp: "2026-01-02T03:04:05.000Z",
    type: "run_started",
  };
  await store.appendEvent(event);
  assert.deepEqual(await store.readEvents("run-1"), [event]);
  await assert.rejects(() => store.appendEvent({ ...event, type: "not-a-type" }));
  const snapshot = {
    artifacts: [],
    createdAt: "2026-01-02T03:04:05.000Z",
    cwd: "/fixture",
    graph: { edges: [], nodes: [] },
    kind: "expert",
    phaseOrder: [],
    phases: [],
    runId: "run-1",
    schemaVersion: 1,
    status: "running",
    task: "fixture task",
    updatedAt: "2026-01-02T03:04:05.000Z",
    strategy: {
      clarify: { confidenceThreshold: 0.5, maxRounds: 3, minRounds: 0 },
      executor: {
        drainingChangeHours: 1,
        frontierTarget: 1,
        maxConcurrentLoops: 1,
        maxConsecutiveErrors: 1,
        maxPlannerRuns: 1,
      },
      finalCritic: { maxIterations: 1 },
      reactLoop: { maxRounds: 1 },
    },
  };
  await store.writeSnapshot(snapshot);
  const written = JSON.parse(await readFile(join(rootDir, "runs", "run-1", "run.json"), "utf8"));
  assert.equal(written.runId, "run-1");
  const index = JSON.parse(await readFile(join(rootDir, "index.json"), "utf8"));
  assert.equal(index.runs[0].runId, "run-1");
  assert.deepEqual(
    Object.keys(index.runs[0]).sort(),
    ["completedAt", "createdAt", "cwd", "kind", "runId", "status", "task", "updatedAt"]
      .filter((key) => index.runs[0][key] !== undefined)
      .sort(),
  );
  const second = { ...snapshot, runId: "run 2/x", updatedAt: "2026-01-02T05:00:00.000Z" };
  await store.writeSnapshot(second);
  const runs = await store.listRuns();
  assert.deepEqual(
    runs.map((run) => run.runId),
    ["run 2/x", "run-1"],
  );
  assert.deepEqual((await store.listRuns({ limit: 1 })).length, 1);
  assert.deepEqual((await store.listRuns({ cwd: "/other" })).length, 0);
  assert.equal((await store.readLatestRun()).runId, "run 2/x");
  const artifact = await store.writeArtifact("run-1", "notes/out.md", "hello");
  assert.equal(artifact.relativePath, join("notes", "out.md"));
  assert.equal(await readFile(artifact.path, "utf8"), "hello");
  const report = await store.writeReport("run-1", "report body");
  assert.equal(report.relativePath, "report.md");
  assert.equal(await readFile(report.path, "utf8"), "report body");
  await assert.rejects(
    () => store.writeArtifact("run-1", "../escape.md", "x"),
    (error) => error.message.includes("Workflow artifact path must stay inside the run directory"),
  );
  assert.equal((await stat(join(rootDir, "runs", "run_2_x"))).isDirectory(), true);
  const definitionsDir = join(rootDir, "definitions");
  await mkdir(definitionsDir, { recursive: true });
  await writeFile(
    join(definitionsDir, "alpha.json"),
    JSON.stringify({
      definitionId: "alpha",
      definitionVersion: "1.0.0",
      description: "fixture",
      kind: "expert",
      phaseOrder: ["intake"],
      phases: [{ behavior: "agent", description: "fixture", phase: "intake", title: "Intake" }],
      strategy: {
        clarify: { confidenceThreshold: 0.5, maxRounds: 3, minRounds: 0 },
        executor: {
          drainingChangeHours: 1,
          frontierTarget: 1,
          maxConcurrentLoops: 1,
          maxConsecutiveErrors: 1,
          maxPlannerRuns: 1,
        },
        finalCritic: { maxIterations: 1 },
        reactLoop: { maxRounds: 1 },
      },
      title: "Fixture workflow",
    }),
  );
  await writeFile(join(definitionsDir, "beta.txt"), "not json");
  const definitions = workflow.createNodeWorkflowDefinitionStore({ definitionsDir });
  const listed = await definitions.listDefinitions();
  assert.deepEqual(
    listed.map((definition) => definition.definitionId),
    ["alpha"],
  );
  assert.equal(await definitions.readDefinition("missing"), null);
  await assert.rejects(
    () => definitions.readDefinition("../escape"),
    (error) => error.message.includes("must be a file-safe name"),
  );
  await writeFile(join(definitionsDir, "gamma.json"), JSON.stringify({ definitionId: "gamma" }));
  await assert.rejects(() => definitions.listDefinitions());
  const emptyDefinitions = workflow.createNodeWorkflowDefinitionStore({
    definitionsDir: join(rootDir, "no-definitions"),
  });
  assert.deepEqual(await emptyDefinitions.listDefinitions(), []);
  assert.equal(workflow.getDefaultWorkflowRoot().endsWith(join("cli", "workflows")), true);
  assert.equal(
    workflow.getDefaultWorkflowDefinitionsRoot(),
    join(workflow.getDefaultWorkflowRoot(), "definitions"),
  );
});

test("B132/B133 provider 空模块与根 barrel 的导出面", () => {
  assert.deepEqual(Object.keys(provider), []);
  assert.equal(typeof rootBarrel.createConfigPort, "function");
  assert.equal(typeof rootBarrel.createNodeFileSystemAdapter, "function");
  assert.equal(typeof rootBarrel.createNodeContextSourceAdapter, "function");
  assert.equal(typeof rootBarrel.createJimpImageProcessorAdapter, "function");
  assert.equal(typeof rootBarrel.createPopplerPdfDocumentAdapter, "function");
  assert.equal(typeof rootBarrel.createNodeLoggerFactory, "function");
  assert.equal(typeof rootBarrel.createNodeSkillAdapter, "function");
  assert.equal(typeof rootBarrel.createNodeCustomCommandAdapter, "function");
  assert.equal(typeof rootBarrel.createNodeWorkflowStore, "function");
  assert.equal(rootBarrel.createNodeSessionMailboxAdapter, undefined);
  assert.equal(rootBarrel.createConfigPort({}).getAll().features.compact, true);
  assert.equal(
    rootBarrel.createNodeContextSourceAdapter({ env: {} }) instanceof
      rootBarrel.NodeContextSourceAdapter,
    true,
  );
  assert.equal(typeof rootBarrel.getDefaultWorkflowRoot(), "string");
  assert.equal(repoRoot.length > 0, true);
});
