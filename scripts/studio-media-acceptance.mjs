#!/usr/bin/env node
// Real packaged UI → Host → CreationService → local HTTP supplier → reference handoff → UI.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createMediaFixture,
  editedPng,
  png,
  verifyPng,
} from "./studio-media-acceptance-fixture.mjs";
import { launchGuardedPackage } from "./studio-media-acceptance-launch.mjs";
import { packagedRuntimeEvidence } from "./packaged-runtime-evidence.mjs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const executable = resolve(process.argv[2] ?? "");
const packageEvidence = await packagedRuntimeEvidence(executable);
assert(
  existsSync(executable) && executable.endsWith(".exe"),
  "Pass the packaged Windows executable",
);
const root = await mkdtemp(join(tmpdir(), "knorvia-media-acceptance-"));
const appData = join(root, "AppData", "Roaming");
const localData = join(root, "AppData", "Local");
const project = join(root, "project");
await Promise.all(
  [appData, localData, join(project, "creation-input")].map((path) =>
    mkdir(path, { recursive: true }),
  ),
);
await writeFile(join(root, "acceptance-owner.json"), JSON.stringify({ executable }));
await writeFile(join(project, "README.md"), "media acceptance baseline\n");
await writeFile(join(project, "creation-input", "art.png"), "PROJECT-DECOY");
const guard = join(dirname(fileURLToPath(import.meta.url)), "studio-media-acceptance-guard.cjs");
const env = Object.fromEntries(
  ["SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC", "TEMP", "TMP"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
Object.assign(env, {
  PATH: `${dirname(process.execPath)};${join(process.env.SystemRoot ?? "C:/Windows", "System32")}`,
  HOME: root,
  USERPROFILE: root,
  APPDATA: appData,
  LOCALAPPDATA: localData,
  KNORVIA_ENV: "production",
  KNORVIA_PORTABLE_DIR: root,
  KNORVIA_BASE_URL: "http://127.0.0.1:9",
  KNORVIA_MEDIA_ACCEPTANCE_ROOT: root,
  KNORVIA_DISABLE_FIXED_REMOTE_DEBUGGING_PORT: "1",
});
const fixture = await createMediaFixture();
const dataRoot = join(root, "data", ".knorvia-studio");
const dbPath = join(dataRoot, "studio", "studio.sqlite");
const result = { root, executable, packageEvidence, checks: [], pageErrors: [], passed: false };
const pass = (text) => {
  result.checks.push(text);
  console.log(`PASS ${text}`);
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const workflowId = "wf_media_acceptance";
const workflowName = "Media PNG Handoff Acceptance";
const firstPrompt = "MEDIA_UI_ORIGINAL_PNG";
const secondPrompt = "MEDIA_UI_EDITED_PNG";
let app;
let page;

async function waitFor(check, label, timeout = 45_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out: ${label}`);
}
async function records(name) {
  return JSON.parse(await readFile(join(dataRoot, "creation", `${name}.json`), "utf8")).items;
}
function readRun() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db
      .prepare("SELECT value FROM studio_entities WHERE kind='run'")
      .all()
      .map((row) => JSON.parse(row.value))
      .find((run) => run.targetId === workflowId);
  } finally {
    db.close();
  }
}
async function launch() {
  app = await launchGuardedPackage({ executable, guard, env });
  const identity = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.hide();
      win.setSize(1360, 900);
      win.webContents.setBackgroundThrottling(false);
    });
    return {
      packaged: electronApp.isPackaged,
      resourcesPath: process.resourcesPath,
      userData: electronApp.getPath("userData"),
      version: electronApp.getVersion(),
      appPath: electronApp.getAppPath(),
    };
  });
  assert.equal(identity.packaged, true);
  assert.equal(resolve(identity.resourcesPath), packageEvidence.resourcesPath);
  assert.equal(resolve(identity.userData), resolve(root, "data", "profile"));
  result.identity = identity;
  page = await app.firstWindow({ timeout: 90_000 });
  page.setDefaultTimeout(35_000);
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  const cdp = await app.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.route(/^https?:\/\//, (route) =>
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
}
async function close() {
  if (!app) return;
  // 真正退出整个应用，不能只把窗口收进托盘。
  const current = app;
  app = undefined;
  const closed = await current.close();
  assert(
    !(result.closedProcesses ?? []).some((entry) => entry.pid === closed.pid),
    "Reopen must use a new process",
  );
  result.closedProcesses = [...(result.closedProcesses ?? []), closed];
}
async function openWorkflow() {
  await page.getByTestId("studio-workflows-open").click();
  await page.getByTestId("studio-workflows").waitFor();
  const run = page.getByRole("button", { name: /^(运行工作流|Run workflow)$/ }).first();
  if (!(await run.isVisible()))
    await page
      .getByRole("button", { name: new RegExp(workflowName) })
      .first()
      .click();
  await run.waitFor();
  return run;
}
async function verifyImages() {
  await page.getByTestId("studio-creation-open").click();
  const creation = page.getByTestId("studio-creation-page");
  await creation.waitFor();
  for (const [prompt, bytes] of [
    [firstPrompt, png],
    [secondPrompt, editedPng],
  ]) {
    const image = creation.getByRole("img", { name: prompt, exact: true });
    await image.waitFor();
    const rendered = await image.evaluate(async (element) => {
      await element.decode();
      return {
        width: element.naturalWidth,
        height: element.naturalHeight,
        source: element.currentSrc,
      };
    });
    assert.equal(rendered.width, 4);
    assert.equal(rendered.height, 4);
    assert.deepEqual(Buffer.from(rendered.source.split(",")[1], "base64"), bytes);
    const card = creation
      .locator("article")
      .filter({ has: page.getByRole("img", { name: prompt, exact: true }) });
    await card.locator("summary").click();
    assert.match(await card.innerText(), /可按原参数重建|Can be reconstructed/i);
  }
}

try {
  await launch();
  const onboarding = page.getByTestId("onboarding-page");
  await onboarding.waitFor();
  for (let step = 0; step < 3; step++)
    await onboarding.getByRole("button", { name: /^(跳过|Skip)$/i }).click();
  await page.getByTestId("studio-first-run-later").click();
  await page.getByTestId("studio-creation-open").click();
  const creation = page.getByTestId("studio-creation-page");
  await creation.getByRole("button", { name: /^(创作模型|Creation models)$/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^(显示名称|Display name)$/i).fill("Loopback PNG");
  await dialog.getByLabel(/^(模型标识|Model ID)$/i).fill("fixture-image");
  await dialog.getByPlaceholder("https://api.example.com").fill(fixture.baseUrl);
  await dialog.locator('input[type="password"]').fill("local-fixture-key");
  await dialog.getByRole("button", { name: /^(保存模型|Save model)$/i }).click();
  const model = await waitFor(
    async () =>
      (await records("models").catch(() => [])).find((item) => item.name === "Loopback PNG"),
    "saved creation model",
  );
  assert.equal(model.baseUrl, fixture.baseUrl);
  await dialog
    .getByRole("button", { name: /^(关闭|Close)$/i })
    .first()
    .click();
  await close();
  pass("真实打包 UI 保存回环创作模型；便携数据根完全隔离");

  const node = (id, kind, label, extra = {}) => ({
    id,
    position: { x: 0, y: 0 },
    data: {
      kind,
      label,
      kernel: "knorvia",
      prompt: "",
      condition: "",
      retryCount: 0,
      retryDelay: 0,
      joinPolicy: "all",
      ...extra,
    },
  });
  const workflow = {
    id: workflowId,
    name: workflowName,
    workspacePath: project,
    updatedAt: Date.now(),
    nodes: [
      node("start", "start", "开始"),
      node("original", "creation", "原图", {
        creationModelId: model.id,
        prompt: firstPrompt,
        outputNames: ["illustration"],
      }),
      node("approve", "approval", "确认引用原图", { prompt: "批准后才允许把原图交给下游编辑" }),
      node("edited", "creation", "参考图编辑", {
        creationModelId: model.id,
        prompt: secondPrompt,
        creationReferencePath: "{{ref.illustration}}",
        outputNames: ["edited"],
      }),
      node("end", "end", "结束"),
    ],
    edges: [
      ["start", "original"],
      ["original", "approve"],
      ["approve", "edited"],
      ["edited", "end"],
    ].map(([source, target], index) => ({ id: `edge-${index}`, source, target })),
  };
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("BEGIN IMMEDIATE");
    const sequence = Number(
      db
        .prepare(
          "UPDATE studio_meta SET value=CAST(value AS INTEGER)+1 WHERE key='sequence' RETURNING value",
        )
        .get().value,
    );
    db.prepare("INSERT INTO studio_entities VALUES ('workflow',?,?,?,?)").run(
      workflowId,
      workflowId,
      JSON.stringify(workflow),
      sequence,
    );
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  await launch();
  await page.getByTestId("studio-activity-rail").waitFor();
  await (await openWorkflow()).click();
  const runDialog = page.getByRole("dialog").last();
  await runDialog.locator("textarea").fill("离线图片链路");
  await runDialog.getByRole("button", { name: /^(运行工作流|Run workflow)$/ }).click();
  await waitFor(() => fixture.requests.length === 1, "first image generation");
  const allow = page
    .getByRole("button", { name: /^(允许这一次|Allow once|允许|批准|Allow|Approve)$/ })
    .first();
  await allow.waitFor({ timeout: 45_000 });
  assert.equal(fixture.requests[0].path, "/v1/images/generations");
  assert.equal(fixture.requests.length, 1);
  pass("工作流由页面提交，真实生成原图后等待人工批准，尚未发出编辑请求");
  await allow.click();
  const run = await waitFor(
    () => {
      const run = readRun();
      if (run?.state === "failed") throw new Error(JSON.stringify(run));
      return run?.state === "succeeded" ? run : null;
    },
    "workflow succeeded",
    90_000,
  );
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(
    fixture.requests.map((item) => item.path),
    ["/v1/images/generations", "/v1/images/edits"],
  );
  pass("批准后真实 CreationService 编辑请求收到上游完整 PNG，未使用项目诱饵");
  const jobs = await records("jobs");
  assert.equal(jobs.length, 2);
  for (const [prompt, bytes] of [
    [firstPrompt, png],
    [secondPrompt, editedPng],
  ]) {
    const job = jobs.find((entry) => entry.prompt === prompt);
    assert.equal(job.status, "succeeded");
    assert.equal(job.outputs.length, 1);
    const saved = await readFile(job.outputs[0].path);
    verifyPng(saved);
    assert.deepEqual(saved, bytes);
    assert.equal(job.outputs[0].hash, hash(bytes));
    if (prompt === secondPrompt) assert.equal(job.referenceHash, hash(png));
  }
  const snapshot = JSON.stringify(run.checkpoint);
  assert.match(snapshot, /creation-output/);
  assert.equal(snapshot.includes(png.toString("base64")), false);
  assert.equal(await readFile(join(project, "creation-input", "art.png"), "utf8"), "PROJECT-DECOY");
  assert.deepEqual((await readdir(project)).sort(), ["README.md", "creation-input"]);
  pass("两张真实产物的磁盘字节/哈希与下游参考一致；检查点保留引用，项目未被改写");
  await verifyImages();
  pass("创作历史实际解码并展示两份不同的 4×4 PNG，参数快照可还原");
  const beforeRestart = fixture.requests.length;
  const jobIds = jobs.map((job) => job.id).sort();
  await close();
  await launch();
  await page.getByTestId("studio-activity-rail").waitFor();
  await openWorkflow();
  await page
    .getByRole("button", { name: /^(运行历史|Run history)$/ })
    .first()
    .click();
  await page
    .getByText(/已完成/)
    .first()
    .waitFor();
  assert.equal(readRun().id, run.id);
  await verifyImages();
  await sleep(2000);
  assert.equal(
    fixture.requests.length,
    beforeRestart,
    "Entire restart must not replay a supplier request",
  );
  assert.deepEqual((await records("jobs")).map((job) => job.id).sort(), jobIds);
  pass("真正退出并重开后工作流/创作历史与图片仍在，整个重启未重新派单");
  const guards = await Promise.all(
    (await readdir(root))
      .filter((name) => /^guard-\d+\.json$/.test(name))
      .map(async (name) => JSON.parse(await readFile(join(root, name), "utf8"))),
  );
  assert(
    guards.some((entry) => entry.type === "browser"),
    "Main network guard loaded",
  );
  assert(
    guards.some((entry) => entry.type === "node"),
    "Real Host network guard loaded",
  );
  assert(
    guards.every((entry) => entry.blockedProbe),
    "Each guard must actually reject an outbound probe before opening a socket",
  );
  result.guards = guards;
  assert.deepEqual(result.pageErrors, []);
  pass("Main/Host 的非回环网络门禁已加载，Renderer 无未捕获异常");
  result.passed = true;
} catch (error) {
  result.error = error.stack ?? String(error);
  if (page && !page.isClosed())
    result.body = (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(-8000);
  process.exitCode = 1;
} finally {
  await close().catch((error) => {
    result.passed = false;
    result.error ??= error.stack;
    process.exitCode = 1;
  });
  await fixture.close();
  result.requests = fixture.requests.map(({ path, body }) => ({
    path,
    bytes: body.length,
    sha256: hash(body),
  }));
  result.fixtureErrors = fixture.errors;
  result.blockedNetwork = (
    await readFile(join(root, "blocked-network.jsonl"), "utf8").catch(() => "")
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  await writeFile(join(root, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`Result: ${join(root, "result.json")}`);
}
