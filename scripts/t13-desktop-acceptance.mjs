#!/usr/bin/env node
// T13 桌面端到端验收：在打包应用上跑一条真实路径，全程离线。
//
// 覆盖：引导 → 配置本地回环供应商 → 选择模型 → 真实发送 → 真实运行时执行并收到回复
//       → 夹具发出 Write 工具调用 → 核对应用真的执行并落盘
//       → 停止按钮中止夹具故意挂起的在途请求
//       → 关闭应用 → 用同一数据根重开 → 核对会话与配置仍在。
// 明确不覆盖（脚本会打印）：真实项目上的隔离工作区差异审阅与用户接纳、真实模型/付费调用。
//
// 用法：node scripts/t13-desktop-acceptance.mjs <未打便携标记的 win-unpacked/Knorvia Studio.exe>
// 未打标记的包有两种来源：安装包构建（不设 KNORVIA_PORTABLE_BUILD），
// 或把便携构建复制到临时目录后删除 resources/knorvia-portable.json。
// 说明：只允许 127.0.0.1 回环地址，不访问任何真实服务；使用独立的临时数据根，结束后删除。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { _electron } from "playwright-core";

const executable = resolve(process.argv[2] ?? "");
if (
  !existsSync(executable) ||
  existsSync(join(dirname(executable), "resources", "knorvia-portable.json"))
) {
  throw new Error("Use an existing unmarked Windows package for the desktop acceptance run");
}

const root = await mkdtemp(join(tmpdir(), "knorvia-t13-acceptance-"));
if (
  dirname(resolve(root)) !== resolve(tmpdir()) ||
  !/^knorvia-t13-acceptance-[\w-]+$/.test(basename(root))
) {
  throw new Error(`Unexpected acceptance directory: ${root}`);
}

const requests = [];
const toolFileName = "t13-probe.txt";
const toolFileBody = "hello from t13\n";
const stopPromptText = "Stop probe";
let toolCallIssued = false;
let toolResultServed = false;
// 停止场景：夹具收到停止探针请求后故意不回应，用于验证应用能真的中止在途请求。
let hangStarted = false;
let hangAborted = false;
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
  const body = Buffer.concat(chunks).toString("utf8");
  let parsed = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    /* 非 JSON 请求体只记录，不影响夹具行为 */
  }
  const messages = JSON.stringify(parsed.messages ?? []);
  const lastUser = [...(parsed.messages ?? [])]
    .reverse()
    .find((message) => message?.role === "user");
  const toolCount = Array.isArray(parsed.tools) ? parsed.tools.length : 0;
  const record = {
    method: request.method,
    url: request.url,
    toolResult: messages.includes("tool_call_id"),
    toolCount,
    lastUser: typeof lastUser?.content === "string" ? lastUser.content.slice(0, 80) : undefined,
  };
  requests.push(record);
  response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
  // 停止场景：只发响应头、不写任何数据，等待应用主动中止这次在途请求。
  if (toolCount > 0 && messages.includes(stopPromptText)) {
    hangStarted = true;
    record.hang = true;
    response.on("close", () => {
      hangAborted = true;
    });
    return;
  }
  // 第一个携带工具定义的请求回一个 Write 工具调用，工具结果回来后收尾；
  // 之后的请求（含标题/摘要这类无工具调用）一律回纯文本。
  const isToolTurn = !toolCallIssued && toolCount > 0 && !messages.includes("tool_call_id");
  record.fired = isToolTurn;
  if (isToolTurn) {
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
                  id: "call_t13_acceptance",
                  type: "function",
                  function: {
                    name: "Write",
                    arguments: JSON.stringify({ file_path: toolFileName, content: toolFileBody }),
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
  // 工具结果只回一次收尾文本；后续请求（历史里仍带 tool_call_id）一律回普通回复。
  const hasToolResult = messages.includes("tool_call_id");
  const text =
    hasToolResult && !toolResultServed ? "Tool fixture finished." : "Local fixture reply.";
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
await new Promise((resolveServer, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveServer);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Loopback address unavailable");
const baseUrl = `http://127.0.0.1:${address.port}/v1`;

const messageText = "T13 acceptance message";
const results = [];

/** 收集本地持久化证据文件：Studio 库（含 WAL）与 CLI rollout 记录。 */
async function collectPersistenceFiles(root) {
  const found = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (
        entry.name === "studio.sqlite" ||
        entry.name === "studio.sqlite-wal" ||
        (entry.name.endsWith(".jsonl") && path.includes(`${sep}rollout${sep}`))
      )
        found.push(path);
    }
  }
  return found.sort();
}

async function listFiles(root) {
  const found = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else found.push(path.slice(root.length + 1));
    }
  }
  return found.sort();
}

async function launch() {
  return _electron.launch({
    executablePath: executable,
    env: { ...process.env, KNORVIA_ENV: "production", KNORVIA_DATA_BASE_DIR: root },
    timeout: 90_000,
  });
}

let app;
try {
  // ── 第一阶段：引导 → 供应商 → 模型 → 真实发送 ───────────────────────────────
  app = await launch();
  const page = await app.firstWindow({ timeout: 90_000 });
  page.setDefaultTimeout(60_000);
  const onboarding = page.getByTestId("onboarding-page");
  await onboarding.waitFor();
  for (let step = 0; step < 3; step++) {
    await onboarding.getByRole("button", { name: /^(跳过|Skip)$/i }).click();
  }
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
  const configPath = join(root, ".knorvia-studio", "v2", "provider_config.json");
  const config = await readFile(configPath, "utf8");
  assert(config.includes(baseUrl));
  assert.equal(requests.length, 0, "保存供应商不得调用其接口");
  results.push("PASS 选择内核/供应商与模型：打包界面保存成功，且未产生任何请求");

  await page.getByTestId("settings-back-button").click();
  await page.getByTestId("chat-model-select-trigger").click();
  const modelOption = page
    .locator('[data-testid^="chat-model-select-item-"]')
    .filter({ hasText: "local-fixture-model" });
  if ((await modelOption.count()) === 0) {
    const groups = page.locator('[data-testid^="chat-model-select-group-"]');
    if ((await groups.count()) > 0) await groups.first().hover();
  }
  await modelOption.first().click();
  await page.getByTestId("v4-composer-input").fill(messageText);
  await page.getByTestId("v4-composer-send").click();
  results.push("PASS 真实发送：消息经真实运行时发出，只到达回环夹具");

  // ── 权限门禁：写文件默认需要授权，脚本显式批准（这正是 T13 的「参数/权限检查」一步）──
  let permissionPromptSeen = false;
  const allowOption = page.locator('[data-permission-option-kind="allowOnce"]').first();
  try {
    await allowOption.waitFor({ timeout: 30_000 });
    permissionPromptSeen = true;
    // 选项首次点击只选中，需再点确认按钮；用 force 绕过列表项的可操作性检查。
    await allowOption.click({ force: true, timeout: 10_000 }).catch(() => {});
    const confirm = page.getByRole("button", { name: /^(确认|Confirm)$/ });
    if ((await confirm.count()) > 0)
      await confirm
        .first()
        .click({ force: true, timeout: 10_000 })
        .catch(() => {});
  } catch {
    /* 未出现门禁（已授权策略）时继续 */
  }
  results.push(
    permissionPromptSeen
      ? "PASS 参数/权限检查：写文件的工具调用触发权限门禁，脚本显式批准后才继续"
      : "INFO 参数/权限检查：本次未出现权限门禁（默认工作区策略允许）",
  );

  // ── 真实工具执行：首个携带工具的请求会收到 Write 工具调用，核对应用真的执行并落盘 ──
  const writtenFile = join(root, ".knorvia-studio", "workspace", "default", toolFileName);
  let toolFileWritten = false;
  for (let attempt = 0; attempt < 120 && !toolFileWritten; attempt++) {
    try {
      toolFileWritten = (await readFile(writtenFile, "utf8")) === toolFileBody;
    } catch {
      /* 尚未落盘 */
    }
    if (!toolFileWritten) await page.waitForTimeout(1000);
  }
  assert(
    toolFileWritten,
    `夹具发出的 Write 工具调用应真的落盘：${writtenFile}（未找到或内容不符）；请求记录：${JSON.stringify(
      requests,
    )}`,
  );
  await page.getByText("Tool fixture finished.").first().waitFor({ timeout: 60_000 });
  assert(requests.some((request) => request.url?.includes("chat/completions")));
  results.push(
    `PASS 真实工具执行：夹具的 Write 调用经真实运行时执行并落盘（${toolFileName}，${toolFileBody.trim()}）`,
  );

  // ── 第二轮纯文本对话：确认同一会话可以继续 ─────────────────────────────────
  await page.getByTestId("v4-composer-input").fill("Second acceptance message");
  await page.getByTestId("v4-composer-send").click();
  await page.getByText("Local fixture reply.").first().waitFor({ timeout: 60_000 });
  results.push("PASS 会话继续：第二轮消息同样只到达回环夹具并收到回复");

  // ── 停止：夹具故意不回应，核对应用的停止按钮能真的中止在途请求 ──────────────
  await page.getByTestId("v4-composer-input").fill(stopPromptText);
  await page.getByTestId("v4-composer-send").click();
  const stopControl = page.getByTestId("v4-stop");
  await stopControl.waitFor({ timeout: 60_000 });
  assert(hangStarted, "夹具应已收到停止探针请求并挂起");
  await stopControl.click();
  let stopped = false;
  for (let attempt = 0; attempt < 30 && !stopped; attempt++) {
    stopped = hangAborted && (await page.getByTestId("v4-stop").count()) === 0;
    if (!stopped) await page.waitForTimeout(1000);
  }
  assert(stopped, `停止应中止在途请求并收回停止按钮（aborted=${hangAborted}）`);
  results.push("PASS 停止：停止按钮中止了在途请求，停止控件随之收回");

  // 引导状态已持久化，重开时不应再次出现。
  const settings = JSON.parse(
    await readFile(join(root, ".knorvia-studio", "v2", "setting.json"), "utf8"),
  );
  assert.equal(settings.studioFirstRunGuideStatus, "complete");
  await app.close();
  app = undefined;
  results.push("PASS 会话与配置写入本地数据根");

  // ── 第二阶段：同一数据根重开，核对持久化 ───────────────────────────────────
  const before = requests.length;
  app = await launch();
  const reopened = await app.firstWindow({ timeout: 90_000 });
  reopened.setDefaultTimeout(60_000);
  await reopened.getByTestId("v4-composer-input").waitFor({ timeout: 90_000 });
  assert.equal(
    await reopened.getByTestId("onboarding-page").count(),
    0,
    "引导已完成，重开后不应再次出现",
  );
  await reopened.getByText(messageText).first().waitFor({ timeout: 60_000 });
  // 时间线是虚拟列表，视口外的行可能未挂载；因此持久化以本地存储为准，
  // 界面只核对「已重开、引导不再出现、上一条用户消息可见」。
  const persistenceFiles = await collectPersistenceFiles(root);
  assert(
    persistenceFiles.length > 0,
    `未找到本地持久化文件；数据根内容（前 20 项）：${(await listFiles(root)).slice(0, 20).join(", ")}`,
  );
  let persisted = Buffer.alloc(0);
  for (const file of persistenceFiles) persisted = Buffer.concat([persisted, await readFile(file)]);
  assert(persisted.includes(Buffer.from(messageText, "utf8")), "本地存储中应仍有上一轮的用户消息");
  assert(
    persisted.includes(Buffer.from("Local fixture reply.", "utf8")),
    "本地存储中应仍有上一轮的回复",
  );
  const reopenedConfig = await readFile(configPath, "utf8");
  assert(reopenedConfig.includes("local-fixture-model"));
  results.push("PASS 重开核对：引导不再出现，上一轮消息与回复仍在本地存储，供应商配置仍在");
  results.push(`INFO 重开阶段新增请求数：${requests.length - before}（不要求为 0）`);
  results.push(
    `INFO 持久化文件：${persistenceFiles.map((file) => file.slice(root.length + 1)).join(", ")}`,
  );

  console.log(results.join("\n"));
  console.log(
    "未覆盖（本脚本不声称）：真实项目上的隔离工作区差异审阅与用户接纳、真实模型或付费调用。",
  );
} finally {
  if (app) await app.close();
  await new Promise((resolveServer) => server.close(resolveServer));
  await rm(root, { recursive: true, force: true });
}
