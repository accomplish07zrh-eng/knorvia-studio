// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 金样生成器（**只在合同阶段对旧实现跑一次**，产出即冻结）。
//
// 金样 = 旧实现真值：本脚本在旧实现（被替换的 model/ 现行代码）上运行，把可观察输出写进
// fixtures/，随后 fixtures/checksums.json 记录哈希。重写阶段**禁止**重新生成；测试只读比对。
//
// 用法（仓库根目录，Node 与 mise.toml 一致，先 pnpm build:cli-packages）：
//   node --import tsx specs/contracts/apps-cli-packages-01-model/tests/build-fixtures.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const fixturesDir = join(contractDir, "fixtures");
const adaptersSrc = join(repoRoot, "apps/cli/packages/adapters/src");

async function loadSource(modulePath) {
  return await import(pathToFileURL(resolve(adaptersSrc, `${modulePath}.ts`)).href);
}

function stable(value) {
  return JSON.stringify(value, null, 2);
}

const written = [];

function writeFixture(relativePath, value) {
  const target = join(fixturesDir, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  const text = typeof value === "string" ? value : `${stable(value)}\n`;
  writeFileSync(target, text, "utf8");
  written.push(relativePath);
}

async function buildProjectionGoldens() {
  const transform = await loadSource("model/transform");
  const toolTransform = await loadSource("model/tool-transform");
  const optionFetch = await loadSource("model/model-option-map-fetch");
  const metadata = await loadSource("model/anthropic-request-metadata");

  // 消息投影金样：覆盖角色、cacheControl、空占位、媒体（图/视频/file/资源链接）、
  // 不支持媒体占位、stripMedia、工具结果（文本化/json/媒体合并）与空名闭合。
  const inputFormat = {
    supportsImage: true,
    supportsPdf: true,
    supportsVideo: false,
  };
  const corpus = [
    { role: "system", content: "sys one", cacheControl: "ephemeral" },
    { role: "user", content: "" },
    {
      role: "user",
      content: [
        { type: "text", text: "hello" },
        {
          type: "image",
          dataUrl: "data:image/png;base64,AAEC",
          mediaType: "image/png",
        },
        {
          type: "video",
          dataUrl: "data:video/mp4;base64,AAAA",
          mediaType: "video/mp4",
        },
        {
          type: "file",
          name: "report.pdf",
          dataUrl: "data:application/pdf;base64,JVBERi0=",
          mediaType: "application/pdf",
        },
        { type: "resource_link", title: "doc", uri: "https://example.invalid/a" },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "step" },
        {
          type: "reasoning",
          text: "why",
          providerOptions: { think: { signature: "sig" } },
        },
      ],
      toolCalls: [
        { id: "call-1", name: "", input: { a: 1 } },
        { id: "call-2", name: "lookup", input: { b: 2 }, providerExecuted: true },
      ],
    },
    {
      role: "tool",
      toolCallId: "call-1",
      toolName: "call-one-tool",
      content: [
        { type: "text", text: "result text" },
        {
          type: "image",
          dataUrl: "data:image/png;base64,AAEC",
          mediaType: "image/png",
        },
        {
          type: "image",
          dataUrl: "data:image/png;base64,AAEC",
          mediaType: "image/png",
        },
      ],
    },
    {
      role: "tool",
      toolCallId: "call-2",
      toolName: "lookup",
      isError: true,
      content: [{ type: "reasoning", text: "hidden" }],
    },
  ];
  writeFixture("projection/messages-default.json", transform.toAiSdkMessages(corpus, {}));
  writeFixture(
    "projection/messages-openai-compatible.json",
    transform.toAiSdkMessages(corpus, {
      providerKind: "openai-compatible",
      apiFormat: "openai-chat-completions",
      inputFormat,
    }),
  );
  writeFixture(
    "projection/messages-strip-media.json",
    transform.toAiSdkMessages(corpus, {
      providerKind: "openai",
      stripMedia: true,
      inputFormat,
    }),
  );

  // 工具投影金样：strict 三条件与 requiresMfjsToolSchema 的 $ref 展开。
  const tools = [
    {
      name: "plain",
      description: "plain tool",
      inputSchema: {
        type: "object",
        properties: { q: { type: "string" } },
        required: ["q"],
      },
      strict: true,
      readOnly: true,
    },
    {
      name: "refs",
      description: "ref tool",
      inputSchema: {
        $defs: { item: { type: "string" } },
        type: "object",
        properties: { item: { $ref: "#/$defs/item" } },
      },
    },
  ];
  const toolSet = toolTransform.toAiSdkTools(tools, {
    providerKind: "anthropic",
    modelId: "claude-sonnet-4-5",
    supportsNativeWebSearch: true,
    requiresMfjsToolSchema: true,
  });
  writeFixture("projection/tools.json", toolSet);
  writeFixture("projection/inputs.json", {
    corpus,
    inputFormat,
    tools,
    optionValues: { reasoningLevel: "high", maxOutputTokens: 4096 },
    optionRequestBody: { model: "m", messages: [] },
  });

  // 选项映射 fetch：改写后的请求体与捕获对象。
  const { compileModelOptionMaps } = await import(
    pathToFileURL(resolve(repoRoot, "packages/model-option-map/src/index.ts")).href
  );
  const maps = compileModelOptionMaps({
    reasoningLevel: { map: '{"reasoning_effort": reasoningLevel}' },
    maxOutputTokens: { map: '{"max_tokens": maxOutputTokens}' },
  });
  const capture = {};
  const fakeFetch = async (_input, init) => ({
    echoedBody: JSON.parse(init.body),
  });
  const wrapped = optionFetch.createModelOptionMapFetch({
    capture,
    fetch: fakeFetch,
    maps,
    values: { reasoningLevel: "high", maxOutputTokens: 4096 },
  });
  const echoed = await wrapped("https://example.invalid/v1", {
    method: "POST",
    body: JSON.stringify({ model: "m", messages: [] }),
  });
  writeFixture("projection/option-map-body.json", {
    echoedBody: echoed.echoedBody,
    captureBody: capture.body,
  });

  // Anthropic 元数据与脱敏金样。
  const userId = await metadata.resolveAnthropicRequestMetadataUserId({
    env: {},
    providerKind: "anthropic",
    sessionId: "sess_golden",
  });
  writeFixture("projection/anthropic-metadata.json", {
    userIdShape:
      userId === undefined
        ? null
        : {
            device_id: JSON.parse(userId).device_id ? "<non-empty-device-id>" : "",
            account_uuid: JSON.parse(userId).account_uuid,
            session_id: JSON.parse(userId).session_id,
          },
    redacted: metadata.redactAnthropicRequestMetadata({
      user_id: "u",
      userId: "u2",
      nested: { USERID: "u3", keep: "v" },
      list: [{ user: "x", uid_keep: 1 }],
    }),
  });
}

async function buildDebugGoldens() {
  rmSync(join(fixturesDir, "model-io"), { recursive: true, force: true });
  const debug = await loadSource("model/runner-debug");
  const sessionKey = "golden-session";
  const request = {
    messages: [{ role: "user", content: "第一轮" }],
    metadata: { sessionId: sessionKey, skipTranscript: false },
    traceContext: { traceId: "trace-golden", sessionId: sessionKey },
    maxOutputTokens: 128,
    providerOptions: { reasoningLevel: "low" },
  };
  const options = {
    model: { fake: true },
    messages: [{ role: "user", content: "第一轮" }],
    maxRetries: 0,
    headers: { authorization: "Bearer secret", "x-ok": "v" },
  };
  const resolved = {
    providerId: "prov",
    modelId: "model-x",
    providerKind: "openai-compatible",
    headers: { authorization: "Bearer secret" },
    baseURL: "https://example.invalid",
    model: { fake: true },
  };
  const base = {
    attempt: 1,
    debugDir: join(fixturesDir, "model-io", "written"),
    isDev: false,
    modelIoFullRetentionEnabled: false,
    normalizedToolCalls: undefined,
    recordModelIO: true,
    requestId: "req-golden",
    resolved,
    startedAt: 1_700_000_000_000,
  };
  await debug.recordGenerateTextDebug({
    ...base,
    request,
    options,
    result: {
      text: "ok",
      finishReason: "stop",
      usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      toolCalls: [],
      steps: [],
      request: { body: { messages: [{ role: "user", content: "第一轮" }] } },
      response: {
        body: { id: "resp-1" },
        headers: { "x-request-id": "rid" },
        id: "resp-1",
      },
    },
  });
  await debug.recordStreamTextDebug({
    ...base,
    request,
    options,
    result: {
      text: Promise.resolve("streamed"),
      reasoning: Promise.resolve(undefined),
      toolResults: Promise.resolve(undefined),
      sources: Promise.resolve(undefined),
      response: Promise.resolve({ id: "resp-2" }),
    },
  });
}

const checksums = {};
async function freezeChecksums() {
  written.push("model-io/written/golden-session.jsonl");
  for (const relativePath of written) {
    const target = join(fixturesDir, relativePath);
    checksums[relativePath] = createHash("sha256").update(readFileSync(target)).digest("hex");
  }
  writeFileSync(
    join(fixturesDir, "checksums.json"),
    `${stable({ generatedBy: "build-fixtures.mjs", files: checksums })}\n`,
    "utf8",
  );
  process.stdout.write(
    `build-fixtures: ${written.length} 个金样已生成并记账（${relative(repoRoot, fixturesDir)}）\n`,
  );
}

await buildProjectionGoldens();
await buildDebugGoldens();
await freezeChecksums();
