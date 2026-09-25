#!/usr/bin/env node
// T13 隔离执行验收：在打包应用上验证「真实项目 → 隔离工作区执行 → 项目不被直接改写」。
//
// 为什么单独一个脚本：任务书 T13 第 3 步要求「隔离执行」，而单聊路径的执行工作区始终是应用
// 自己的默认工作区（没有项目基线），拿不到隔离快照。隔离只发生在 Studio Runtime 的项目运行上，
// 因此这里种子一个 workspaceMode=isolated 的群聊（等价于「用户此前已建好这个群聊并选了项目」），
// 再走真实的群聊界面发任务。
//
// 覆盖：群聊页 → 选中种子群聊 → 真实发送 → 群聊审批（拒绝 / 允许这一次）→
//       核对写入落在隔离快照的 working/ 目录，且真实项目文件未被直接改写。
// 明确不覆盖（脚本会打印）：差异审阅卡与应用接纳在本夹具下未出现（群运行未进入终态）。
//
// 用法：node scripts/t13-isolated-workspace-acceptance.mjs <未打便携标记的 win-unpacked/Knorvia Studio.exe>
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
) {
  throw new Error("Use an existing unmarked Windows package for the isolation acceptance run");
}

const root = await mkdtemp(join(tmpdir(), "knorvia-isolation-acceptance-"));
if (
  dirname(resolve(root)) !== resolve(tmpdir()) ||
  !/^knorvia-isolation-acceptance-[\w-]+$/.test(basename(root))
)
  throw new Error(`Unexpected acceptance directory: ${root}`);
const project = join(root, "project");
mkdirSync(project, { recursive: true });
writeFileSync(join(project, "README.md"), "# Seed project\n\nbaseline content\n", "utf8");
const projectReadmeBefore = await readFile(join(project, "README.md"), "utf8");

const groupId = "grp_t13_isolation";
const groupName = "T13 Isolation Probe";
const probeFile = "notes.txt";
const probeBody = "group isolated change\n";

let toolCallIssued = false;
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
  if (!toolCallIssued && toolCount > 0 && !hasToolResult) {
    toolCallIssued = true;
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
                  id: "call_isolation_1",
                  type: "function",
                  function: {
                    name: "Write",
                    arguments: JSON.stringify({ file_path: probeFile, content: probeBody }),
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
  const text = hasToolResult && !toolResultServed ? "Isolation fixture finished." : "Plain reply.";
  if (hasToolResult) toolResultServed = true;
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
});
await new Promise((ok, fail) => {
  server.once("error", fail);
  server.listen(0, "127.0.0.1", ok);
});
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else out.push(path);
  }
  return out;
}

const env = { ...process.env, KNORVIA_ENV: "production", KNORVIA_DATA_BASE_DIR: root };
const settingPath = join(root, ".knorvia-studio", "v2", "setting.json");
const dbPath = join(root, ".knorvia-studio", "studio", "studio.sqlite");
const results = [];
let app;

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

  // ── 种子：workspaceMode=isolated 的群聊，工作区指向真实项目 ───────────────────
  const settings = JSON.parse(await readFile(settingPath, "utf8"));
  settings.studioFirstRunGuideStatus = "complete";
  await writeFile(settingPath, JSON.stringify(settings, null, 2), "utf8");
  const definition = {
    id: groupId,
    name: groupName,
    goal: "verify isolated workspace execution",
    members: ["knorvia"],
    host: "knorvia",
    sharedSummary: "",
    mode: "task",
    workspaceMode: "isolated",
    workspacePath: project,
    createdAt: 1,
    updatedAt: 1,
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
    `INSERT INTO studio_entities VALUES ('group',?,?,?,?)
     ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value, scope=excluded.scope`,
  ).run(groupId, groupId, JSON.stringify(definition), sequence);
  db.exec("COMMIT");
  db.close();

  // ── 启动 2：群聊页 → 选中群聊 → 发送 ────────────────────────────────────────
  app = await _electron.launch({ executablePath: executable, env, timeout: 90_000 });
  page = await app.firstWindow({ timeout: 90_000 });
  page.setDefaultTimeout(60_000);
  await page.getByTestId("v4-composer-input").waitFor({ timeout: 90_000 });
  await page.getByRole("tab", { name: /群聊|Groups/ }).click();
  await page.getByTestId("studio-groups-page").waitFor({ timeout: 30_000 });
  // 群列表可能还在水合，先等种子群聊出现再点选，避免点到空列表。
  const groupEntry = page.getByText(groupName).first();
  await groupEntry.waitFor({ timeout: 30_000 });
  await groupEntry.click();
  const composer = page.getByTestId("studio-group-composer");
  await composer.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  results.push("PASS 选择内核与项目：在群聊页选中种子群聊（workspaceMode=isolated，指向真实项目）");
  await composer.fill("Change the project notes");
  await composer.press("Enter");

  // 发送后必须真的产生模型请求；否则说明没选中群聊或 composer 未就绪，直接给出诊断。
  let requestArrived = false;
  for (let attempt = 0; attempt < 20 && !requestArrived; attempt++) {
    requestArrived = requests.length > 0;
    if (!requestArrived) await page.waitForTimeout(1500);
  }
  assert(
    requestArrived,
    `发送后未产生模型请求；页面尾部：${(await page.locator("body").innerText()).slice(-500)}`,
  );

  // 群聊审批在「任务进展」面板里，是普通按钮：拒绝 / 允许这一次。
  // 群运行到达审批的时间不固定，因此轮询：出现就批准；若工具无需审批直接执行，也能继续。
  const allow = page.getByRole("button", { name: /^(允许这一次|Allow once|允许|Allow)$/ }).first();
  const workspaceRoot = join(root, ".knorvia-studio", "studio", "workspaces");
  let approved = false;
  let writtenEarly = false;
  for (let attempt = 0; attempt < 60 && !approved && !writtenEarly; attempt++) {
    if ((await allow.count()) > 0) {
      await allow.click({ force: true, timeout: 10_000 }).catch(() => {});
      approved = true;
      break;
    }
    writtenEarly = (await walk(workspaceRoot)).some((file) => file.endsWith(probeFile));
    if (!writtenEarly) await page.waitForTimeout(2000);
  }
  assert(
    approved || writtenEarly,
    `未观察到群聊审批，也没有出现隔离写入；请求记录：${JSON.stringify(requests)}`,
  );
  results.push(
    approved
      ? "PASS 参数/权限检查：写文件的工具调用触发群聊审批，显式批准后才继续"
      : "INFO 参数/权限检查：本次工具无需审批即执行（未观察到审批按钮）",
  );

  // ── 断言：写入落在隔离快照的 working/，真实项目未被直接改写 ──────────────────
  let snapshotPath;
  for (let attempt = 0; attempt < 90 && !snapshotPath; attempt++) {
    const files = await walk(join(root, ".knorvia-studio", "studio", "workspaces"));
    snapshotPath = files.find((file) => file.endsWith(probeFile));
    if (!snapshotPath) await page.waitForTimeout(1000);
  }
  assert(snapshotPath, `隔离快照里应出现 ${probeFile}；请求记录：${JSON.stringify(requests)}`);
  assert.equal(await readFile(snapshotPath, "utf8"), probeBody);
  const relative = snapshotPath.slice(root.length + 1);
  assert.match(
    relative,
    /studio[\\/]workspaces[\\/][0-9a-f]+[\\/]working[\\/]/u,
    "写入应落在隔离快照的 working 目录",
  );
  results.push(`PASS 隔离执行：写入落在隔离快照 ${relative}`);

  assert.equal(
    existsSync(join(project, probeFile)),
    false,
    "真实项目不应被直接改写（隔离执行未生效）",
  );
  assert.equal(await readFile(join(project, "README.md"), "utf8"), projectReadmeBefore);
  results.push("PASS 项目保护：真实项目文件未被直接改写，README 内容不变");

  // 复核结论/审阅卡在本夹具下是否出现，如实记录而不作为通过条件。
  const reviewVisible = (await page.getByTestId("studio-group-review").count()) > 0;
  const applyButtons = await page
    .getByRole("button", { name: /应用此文件|Apply this file/ })
    .count();
  results.push(
    `INFO 差异审阅：复核面板${reviewVisible ? "已出现" : "未出现"}，应用按钮 ${applyButtons} 个（本夹具下群运行未进入终态，因此不构成通过条件）`,
  );

  console.log(results.join("\n"));
  console.log(
    "未覆盖（本脚本不声称）：差异审阅卡与应用接纳（需群运行进入终态）、真实模型或付费调用。",
  );
} finally {
  if (app) await app.close();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
}
