#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { _electron } from "playwright-core";

const executable = resolve(process.argv[2] ?? "");
if (
  !existsSync(executable) ||
  existsSync(join(dirname(executable), "resources", "knorvia-portable.json"))
) {
  throw new Error("Use an existing unmarked Windows package for loopback smoke testing");
}

const root = await mkdtemp(join(tmpdir(), "knorvia-provider-smoke-"));
if (
  dirname(resolve(root)) !== resolve(tmpdir()) ||
  !/^knorvia-provider-smoke-[\w-]+$/.test(basename(root))
) {
  throw new Error(`Unexpected smoke-test directory: ${root}`);
}
const requests = [];
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  requests.push({
    method: request.method,
    url: request.url,
    body: Buffer.concat(chunks).toString("utf8"),
  });
  response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
  response.write(
    `data: ${JSON.stringify({
      id: "chatcmpl-local-fixture",
      object: "chat.completion.chunk",
      created: 0,
      model: "local-fixture-model",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "Local fixture reply." },
          finish_reason: null,
        },
      ],
    })}\n\n`,
  );
  response.end(
    `data: ${JSON.stringify({
      id: "chatcmpl-local-fixture",
      object: "chat.completion.chunk",
      created: 0,
      model: "local-fixture-model",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    })}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise((resolveServer, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveServer);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Loopback address unavailable");
const baseUrl = `http://127.0.0.1:${address.port}/v1`;

let app;
try {
  app = await _electron.launch({
    executablePath: executable,
    env: { ...process.env, KNORVIA_ENV: "production", KNORVIA_DATA_BASE_DIR: root },
    timeout: 90000,
  });
  const page = await app.firstWindow({ timeout: 90000 });
  page.setDefaultTimeout(60000);
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
  assert(config.includes("local-fixture-model"));
  assert.equal(requests.length, 0, "saving a provider should not call its API");
  console.log("PASS model provider and model saved through the packaged UI without network calls");

  await page.getByTestId("settings-back-button").click();
  await page.getByTestId("chat-model-select-trigger").click();
  const modelOption = page
    .locator('[data-testid^="chat-model-select-item-"]')
    .filter({ hasText: "local-fixture-model" });
  if ((await modelOption.count()) === 0) {
    const groups = page.locator('[data-testid^="chat-model-select-group-"]');
    const labels = await groups.allTextContents();
    console.log(`Model provider menu groups: ${JSON.stringify(labels)}`);
    if ((await groups.count()) > 0) await groups.first().hover();
  }
  await modelOption.first().click();
  await page.getByTestId("v4-composer-input").fill("Hello from the offline smoke test");
  await page.getByTestId("v4-composer-send").click();
  await page.getByText("Local fixture reply.").first().waitFor({ timeout: 60000 });
  assert(requests.some((request) => request.url?.includes("chat/completions")));
  const settings = JSON.parse(
    await readFile(join(root, ".knorvia-studio", "v2", "setting.json"), "utf8"),
  );
  assert.equal(settings.studioFirstRunGuideStatus, "complete");
  console.log("PASS first chat reaches only the loopback fixture and completes the guide");
} finally {
  if (app) await app.close();
  await new Promise((resolveServer) => server.close(resolveServer));
  await rm(root, { recursive: true, force: true });
}
