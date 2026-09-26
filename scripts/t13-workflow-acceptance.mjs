#!/usr/bin/env node
// T13 工作流界面验收：在打包应用上跑通「盘点 → 人工批准 → 整理 → 查看修改 → 接受文件」。
//
// 为什么单独一个脚本：前两个脚本覆盖单聊与群聊路径；工作流路径此前只在服务层用例里跑过
// （studio-workflow-delivery-path.test.ts），界面级没有验收。本脚本补这一段。
//
// 覆盖：侧栏进入工作流页 → 选中种子工作流 → 运行工作流（真实运行时）→ 人工批准 →
//       整理节点经真实工具调用在隔离工作区写出文件 → 运行历史显示「已产出」→
//       查看修改 → 应用此文件 → 核对真实项目被写入。
// 用法：node scripts/t13-workflow-acceptance.mjs <未打便携标记的 win-unpacked/Knorvia Studio.exe>
// 说明：只允许 127.0.0.1 回环地址；项目与数据根都在临时目录，结束后删除。
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { _electron } = require("playwright-core");
const { DatabaseSync } = require("node:sqlite");

const executable = resolve(process.argv[2] ?? "");
if (
  !existsSync(executable) ||
  existsSync(join(dirname(executable), "resources", "knorvia-portable.json"))
)
  throw new Error("Use an existing unmarked Windows package for the workflow acceptance run");

const root = await mkdtemp(join(tmpdir(), "knorvia-workflow-acceptance-"));
if (
  dirname(resolve(root)) !== resolve(tmpdir()) ||
  !/^knorvia-workflow-acceptance-[\w-]+$/.test(basename(root))
)
  throw new Error(`Unexpected acceptance directory: ${root}`);
const project = join(root, "project");
mkdirSync(join(project, "docs"), { recursive: true });
writeFileSync(join(project, "README.md"), "baseline\n", "utf8");
writeFileSync(join(project, "docs", "old.md"), "旧文档\n", "utf8");

const workflowId = "wf_t13_acceptance";
const workflowName = "T13 Workflow Acceptance";
const cleanupPath = "docs/cleanup.md";
const cleanupBody = "整理结果\n";

// 回环夹具：盘点节点回结构化 JSON；整理节点发一次 Write 工具调用；工具结果后回文本。
let planServed = false;
let toolIssued = false;
let toolResultServed = false;
const requests = [];
const chunkOf = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
const chunkBase = {
  id: "chatcmpl-local-fixture",
  object: "chat.completion.chunk",
  created: 0,
  model: "local-fixture-model",
};
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let parsed = {};
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    /* 非 JSON 请求体只记录 */
  }
  const messages = JSON.stringify(parsed.messages ?? []);
  const toolCount = Array.isArray(parsed.tools) ? parsed.tools.length : 0;
  const hasToolResult = messages.includes("tool_call_id");
  requests.push({ toolCount, hasToolResult });
  response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
  const plain = (text) => {
    response.write(
      chunkOf({
        ...chunkBase,
        choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }],
      }),
    );
    response.end(
      chunkOf({ ...chunkBase, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) +
        "data: [DONE]\n\n",
    );
  };
  if (toolCount === 0) {
    plain("Plain reply.");
    return;
  }
  if (hasToolResult) {
    toolResultServed = true;
    plain("整理完成。");
    return;
  }
  if (!planServed) {
    planServed = true;
    // 盘点节点：按名建键的 JSON → 两个命名输出。
    plain(JSON.stringify({ inventory: "清单正文", deletions: ["docs/old.md"] }));
    return;
  }
  if (!toolIssued) {
    toolIssued = true;
    response.write(
      chunkOf({
        ...chunkBase,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call_wf_1",
                  type: "function",
                  function: {
                    name: "Write",
                    arguments: JSON.stringify({ file_path: cleanupPath, content: cleanupBody }),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
    );
    response.end(
      chunkOf({ ...chunkBase, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }) +
        "data: [DONE]\n\n",
    );
    return;
  }
  plain(toolResultServed ? "整理完成。" : "等待整理。");
});
await new Promise((ok, fail) => {
  server.once("error", fail);
  server.listen(0, "127.0.0.1", ok);
});
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

const env = { ...process.env, KNORVIA_ENV: "production", KNORVIA_DATA_BASE_DIR: root };
const settingPath = join(root, ".knorvia-studio", "v2", "setting.json");
const dbPath = join(root, ".knorvia-studio", "studio", "studio.sqlite");
const results = [];
let app;

/** 列出目录下的相对文件路径（诊断用；目录不存在时返回空）。 */
async function walk(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    const label = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path, label)));
    else out.push(label);
  }
  return out;
}

/** 诊断：工作区记录的键与运行检查点里的步骤键，用来判断界面绑定的是哪一组 id。 */
function inspectRunState() {
  const db = new DatabaseSync(dbPath);
  try {
    const workspaceIds = db
      .prepare("SELECT id FROM studio_entities WHERE kind='workspace'")
      .all()
      .map((row) => row.id);
    const runs = db
      .prepare("SELECT id, value FROM studio_entities WHERE kind='run'")
      .all()
      .map((row) => ({
        id: row.id,
        stepKeys: Object.keys(JSON.parse(row.value).checkpoint?.steps ?? {}),
        workspaceStepIds: JSON.parse(row.value).workspaceStepIds ?? null,
      }));
    return { workspaceIds, runs };
  } finally {
    db.close();
  }
}

/** 点击任何出现的审批按钮。
 *
 * 工作流的人工批准节点与写文件的工具副作用审批都用「允许这一次」；两者出现时间不固定
 * （批准节点要等盘点节点跑完），因此轮询到出现为止，而不是等固定次数。
 */
async function approveAnything(page, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  let approved = false;
  while (Date.now() < end) {
    const allow = page
      .getByRole("button", { name: /^(允许这一次|Allow once|允许|同意|批准|Allow|Approve)$/ })
      .first();
    if ((await allow.count()) > 0) {
      await allow.click({ force: true, timeout: 10_000 }).catch(() => {});
      approved = true;
      await page.waitForTimeout(1500);
      continue;
    }
    await page.waitForTimeout(1500);
  }
  return approved;
}

try {
  // ── 启动 1：完成引导与本地回环供应商配置 ─────────────────────────────────────
  app = await _electron.launch({ executablePath: executable, env, timeout: 90_000 });
  let page = await app.firstWindow({ timeout: 90_000 });
  page.setDefaultTimeout(60_000);
  const onboarding = page.getByTestId("onboarding-page");
  await onboarding.waitFor();
  for (let step = 0; step < 3; step++)
    await onboarding.getByRole("button", { name: /^(跳过|Skip)$/i }).click();
  await page.getByTestId("studio-first-run-provider").click();
  const picker = page.getByTestId("model-provider-template-picker");
  await picker.waitFor();
  await picker.getByTestId("model-provider-template-item-custom").click();
  const baseInput = page.getByTestId("model-provider-base-url-input");
  await baseInput.waitFor();
  await baseInput.fill(baseUrl);
  await baseInput.press("Tab");
  await page.getByTestId("model-provider-api-format-trigger").click();
  await page.getByTestId("model-provider-api-format-item-openai-chat-completions").click();
  const keyInput = page.getByTestId("model-provider-api-key-input");
  await keyInput.fill("local-fixture-key");
  await keyInput.press("Tab");
  await page.getByTestId("model-provider-add-model-button").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/模型 ID|Model ID/i).fill("local-fixture-model");
  await dialog.getByRole("button", { name: /^(保存|Save)$/i }).click();
  await page.getByTestId("model-provider-model-input-0").waitFor();
  await page.getByTestId("settings-back-button").click();
  await app.close();
  app = undefined;

  // ── 种子：引导完成 + 盘点 → 人工批准 → 整理 的工作流 ─────────────────────────
  const settings = JSON.parse(await readFile(settingPath, "utf8"));
  settings.studioFirstRunGuideStatus = "complete";
  await writeFile(settingPath, JSON.stringify(settings, null, 2), "utf8");
  const node = (id, kind, label, extra = {}) => ({
    id,
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
    position: { x: 0, y: 0 },
  });
  const definition = {
    id: workflowId,
    name: workflowName,
    workspacePath: project,
    nodes: [
      node("n0", "start", "开始"),
      node("n1", "agent", "盘点", {
        prompt: "盘点文档",
        outputs: [
          { name: "inventory", from: "json" },
          { name: "deletions", from: "json" },
        ],
      }),
      node("n2", "approval", "人工批准", { prompt: "确认整理：{{ref.inventory}}" }),
      node("n3", "agent", "整理", { prompt: "按 {{ref.inventory}} 整理文档" }),
      node("n4", "end", "结束"),
    ],
    edges: [
      { id: "e0", source: "n0", target: "n1" },
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
    updatedAt: Date.now(),
  };
  const db = new DatabaseSync(dbPath);
  db.exec("BEGIN IMMEDIATE");
  const sequence = Number(
    db
      .prepare(
        "UPDATE studio_meta SET value=CAST(value AS INTEGER)+1 WHERE key='sequence' RETURNING value",
      )
      .get().value,
  );
  db.prepare(
    `INSERT INTO studio_entities VALUES ('workflow',?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value, scope=excluded.scope`,
  ).run(workflowId, workflowId, JSON.stringify(definition), sequence);
  db.exec("COMMIT");
  db.close();

  // ── 启动 2：工作流页 → 选中 → 运行 → 批准 ───────────────────────────────────
  app = await _electron.launch({ executablePath: executable, env, timeout: 90_000 });
  page = await app.firstWindow({ timeout: 90_000 });
  page.setDefaultTimeout(60_000);
  await page.getByTestId("v4-composer-input").waitFor({ timeout: 90_000 });
  await page
    .getByText(/^工作流$|^Workflows$/)
    .first()
    .click();
  await page.getByTestId("studio-workflows").waitFor({ timeout: 30_000 });
  await page
    .getByRole("button", { name: new RegExp(workflowName) })
    .first()
    .click();
  const runButton = page.getByRole("button", { name: /^运行工作流$|^Run workflow$/ }).first();
  await runButton.waitFor({ timeout: 30_000 });
  results.push("PASS 工作流界面可达：侧栏进入工作流页、选中种子工作流、找到「运行工作流」入口");

  await runButton.click();
  const runDialog = page.getByRole("dialog").last();
  const input = runDialog.locator("textarea, input").first();
  await input.waitFor({ timeout: 20_000 });
  await input.fill("盘点并整理文档");
  await runDialog
    .getByRole("button", { name: /^(运行工作流|Run workflow)$/ })
    .last()
    .click();
  results.push("PASS 从界面发起运行：运行对话框提交，请求只到达回环夹具");

  const approved = await approveAnything(page);
  assert(
    approved,
    `工作流的人工批准节点应弹出审批，脚本必须能显式批准；页面尾部：${(await page.locator("body").innerText()).slice(-700)}`,
  );
  results.push("PASS 参数/权限检查：人工批准节点与写文件的工具调用都触发审批，显式批准后才继续");

  // ── 断言：运行完成、产物可见、真实项目被写入 ────────────────────────────────
  let done = false;
  for (let attempt = 0; attempt < 90 && !done; attempt++) {
    const text = await page.locator("body").innerText();
    done = /已完成 · \d|已产出/.test(text) && !/执行中/.test(text);
    if (!done) await page.waitForTimeout(2000);
  }
  const body = await page.locator("body").innerText();
  assert(done, `工作流应运行完成；页面尾部：${body.slice(-600)}`);
  assert.match(body, /已产出/, "运行历史应显示节点产出");
  assert.ok(
    requests.some((item) => item.hasToolResult),
    `工具结果应回到模型；请求记录：${JSON.stringify(requests)}`,
  );
  results.push("PASS 真实执行：工作流在打包应用里跑完，运行历史显示「已产出」，工具结果回到模型");

  // 查看修改 → 应用此文件（运行历史里每个运行是 <details>，步骤行的按钮要先展开才可见；
  // 每个步骤各有一个「查看修改」，只有真正产出文件的那一步会有修改，因此逐个试。）
  await page
    .locator("details")
    .evaluateAll((nodes) => nodes.forEach((node) => (node.open = true)))
    .catch(() => {});
  await page.waitForTimeout(2000);
  const applyButton = page.getByRole("button", { name: /应用此文件|Apply this file/ }).first();
  let applyCount = 0;
  const reviewButtons = page.getByRole("button", { name: /^查看修改$|^Review changes$/ });
  const reviewCount = await reviewButtons.count();
  for (let index = reviewCount - 1; index >= 0 && applyCount === 0; index--) {
    // 从最后一个步骤开始试：真正产出文件的是整理节点（运行历史里靠后）。
    await reviewButtons
      .nth(index)
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(3000);
    for (let attempt = 0; attempt < 8 && applyCount === 0; attempt++) {
      applyCount = await applyButton.count();
      if (applyCount === 0) await page.waitForTimeout(1500);
    }
  }
  assert(
    applyCount > 0,
    `工作流运行历史里应能打开修改审阅并找到「应用此文件」（共 ${reviewCount} 个「查看修改」）；` +
      `项目里是否有该文件=${existsSync(join(project, cleanupPath))}；` +
      `数据根下的工作区文件=${JSON.stringify(await walk(join(root, ".knorvia-studio", "studio", "workspaces")))}；` +
      `应用记录=${JSON.stringify(inspectRunState())}；` +
      `页面尾部：${(await page.locator("body").innerText()).slice(-900)}`,
  );
  assert.equal(
    await readFile(join(project, cleanupPath), "utf8").catch(() => null),
    null,
    "应用前真实项目不应有该文件",
  );
  await applyButton.click({ force: true, timeout: 15_000 });
  let applied = false;
  for (let attempt = 0; attempt < 30 && !applied; attempt++) {
    applied = existsSync(join(project, cleanupPath));
    if (!applied) await page.waitForTimeout(1000);
  }
  assert(applied, "应用后真实项目里应出现整理结果");
  assert.equal(await readFile(join(project, cleanupPath), "utf8"), cleanupBody);
  results.push("PASS 用户接纳：界面里应用修改后，真实项目按隔离快照内容被写入");

  console.log(results.join("\n"));
  console.log(
    "未覆盖（本脚本不声称）：真实模型、真实 CLI/ACP 内核与付费调用；创作媒体路径未在界面上跑。",
  );
} finally {
  if (app) await app.close();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
