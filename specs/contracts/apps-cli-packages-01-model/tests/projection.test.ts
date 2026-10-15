// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 契约测试：B27–B36（消息、工具与媒体投影）。
// 投影金样对比走 fixtures/projection/*（旧实现真值，checksums.json 记账）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixturesDir, load, loadAbsolute, repoRoot } from "./entry.mjs";

const { toAiSdkMessages } = await load("model/transform");
const { toAiSdkTools } = await load("model/tool-transform");
const { normalizeModelToolInput } = await load("model/tool-input-normalization");
const { dataUrlToDataContent, unsupportedInputMediaText } = await load(
  "model/media-transform-policy",
);
const {
  shouldTextifyStructuredToolResults,
  toStructuredToolResultText,
  toToolResultMediaUserParts,
  toolResultHasVideoMedia,
  undeliverableFrameReferenceText,
} = await load("model/tool-result-media-projection");
const { providerOptionsForReasoningBlock } = await load("model/anthropic-reasoning-metadata");
const { redactAnthropicRequestMetadata, resolveAnthropicRequestMetadataUserId } = await load(
  "model/anthropic-request-metadata",
);
const { normalizeReasoningHistory, repairReasoningHistoryAfterSignatureRejection } = await load(
  "model/reasoning-history-normalization",
);

const inputs = JSON.parse(readFileSync(join(fixturesDir, "projection/inputs.json"), "utf8"));
const golden = (name: string) =>
  JSON.parse(readFileSync(join(fixturesDir, `projection/${name}.json`), "utf8"));

test("B27–B31 消息投影金样（默认 provider）", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(toAiSdkMessages(inputs.corpus, {}))),
    golden("messages-default"),
  );
});

test("B27–B31 消息投影金样（openai-compatible 文本化路径）", () => {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        toAiSdkMessages(inputs.corpus, {
          providerKind: "openai-compatible",
          apiFormat: "openai-chat-completions",
          inputFormat: inputs.inputFormat,
        }),
      ),
    ),
    golden("messages-openai-compatible"),
  );
});

test("B27–B31 消息投影金样（stripMedia 路径）", () => {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        toAiSdkMessages(inputs.corpus, {
          providerKind: "openai",
          stripMedia: true,
          inputFormat: inputs.inputFormat,
        }),
      ),
    ),
    golden("messages-strip-media"),
  );
});

test("B27 tool 消息缺标识即抛（含空串）", () => {
  assert.throws(
    () => toAiSdkMessages([{ role: "tool", toolCallId: "c", toolName: "", content: [] } as never]),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "invalid_model_request");
      assert.equal((error as Error).message, "Tool messages require toolCallId and toolName");
      return true;
    },
  );
});

test("B28 连续 tool 媒体合并（防 MissingToolResultsError 的既有修复）", () => {
  const image = {
    type: "image",
    dataUrl: "data:image/png;base64,AAEC",
    mediaType: "image/png",
  };
  const output = toAiSdkMessages(
    [
      {
        role: "tool",
        toolCallId: "a",
        toolName: "ta",
        content: [{ type: "text", text: "r1" }, image],
      },
      {
        role: "tool",
        toolCallId: "b",
        toolName: "tb",
        content: [{ type: "text", text: "r2" }, image],
      },
      { role: "user", content: "after" },
    ] as never,
    {},
  );
  assert.deepEqual(
    output.map((message: { role: string }) => message.role),
    ["tool", "tool", "user", "user"],
  );
  const mediaMessage = output[2] as { content: unknown[] };
  assert.equal(mediaMessage.content.length, 2);
});

test("B29 空占位与塌缩规则", () => {
  const emptyUser = toAiSdkMessages([{ role: "user", content: "" }] as never, {});
  assert.deepEqual(emptyUser, [{ role: "user", content: "[Empty user message]" }]);
  const singleText = toAiSdkMessages(
    [{ role: "user", content: [{ type: "text", text: "solo" }] }] as never,
    {},
  );
  assert.deepEqual(singleText, [{ role: "user", content: "solo" }]);
  const invalidMedia = toAiSdkMessages(
    [
      {
        role: "user",
        content: [
          { type: "image", dataUrl: "nope", mediaType: "image/png" },
          { type: "video", dataUrl: "nope", mediaType: "video/mp4" },
          { type: "file", dataUrl: "nope", mediaType: "application/pdf" },
        ],
      },
    ] as never,
    {},
  );
  const parts = (invalidMedia[0] as { content: { text: string }[] }).content;
  assert.deepEqual(
    parts.map((part) => part.text),
    ["[Invalid image data]", "[Invalid video data]", "[Invalid file data]"],
  );
});

test("B30 data URL 解析与不支持媒体占位文案（语义常量）", () => {
  assert.deepEqual(dataUrlToDataContent("data:image/png;base64,AAEC"), {
    mediaType: "image/png",
    data: "AAEC",
  });
  assert.deepEqual(dataUrlToDataContent("data:image/png;base64,AA\r\nEC"), {
    mediaType: "image/png",
    data: "AAEC",
  });
  assert.equal(dataUrlToDataContent("data:image/png,raw"), undefined);
  const block = {
    type: "file",
    mediaType: "application/pdf; version=1",
    dataUrl: "data:application/pdf;base64,AA",
  };
  assert.equal(
    unsupportedInputMediaText(
      block as never,
      {
        supportsImage: true,
        supportsPdf: false,
        supportsVideo: true,
      } as never,
    ),
    "[Attached application/pdf; version=1]\n[Media omitted from provider request because the selected model does not support PDF input.]",
  );
  assert.equal(
    unsupportedInputMediaText(
      { type: "image", name: "shot.png" } as never,
      {
        supportsImage: false,
        supportsPdf: true,
        supportsVideo: true,
      } as never,
    ),
    "[Attached shot.png]\n[Media omitted from provider request because the selected model does not support image input.]",
  );
  assert.equal(unsupportedInputMediaText(block as never, undefined), undefined);
});

test("B31 工具结果媒体与 CUA 帧引用邻接", () => {
  assert.equal(shouldTextifyStructuredToolResults({ providerKind: "openai-compatible" }), true);
  assert.equal(shouldTextifyStructuredToolResults({ apiFormat: "openai-chat-completions" }), true);
  assert.equal(shouldTextifyStructuredToolResults({ providerKind: "anthropic" }), false);
  assert.equal(
    toolResultHasVideoMedia([
      { type: "file", mediaType: "video/mp4", dataUrl: "data:video/mp4;base64,AA" },
    ] as never),
    true,
  );
  assert.equal(toolResultHasVideoMedia("text"), false);
  assert.equal(
    toStructuredToolResultText([
      { type: "text", text: "a" },
      { type: "reasoning", text: "hidden" },
      { type: "resource_link", title: "doc", uri: "u" },
      { type: "image", mediaType: "image/png" },
    ] as never),
    "a\n\n[Resource: doc]\n\n[Attached image/png]",
  );
  const parts = toToolResultMediaUserParts(
    [
      {
        type: "image",
        dataUrl: "data:image/png;base64,AAEC",
        mediaType: "image/png",
      },
    ] as never,
    { toolName: "t", inputFormat: undefined },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(parts)), [
    { type: "image", image: "AAEC", mediaType: "image/png" },
  ]);
  assert.equal(
    undeliverableFrameReferenceText([{ type: "text", text: "not a frame ref" }] as never, {}),
    undefined,
  );
});

test("B32 工具契约到 AI SDK 工具集（金样 + 两个错误面）", () => {
  const actual = toAiSdkTools(inputs.tools, {
    providerKind: "anthropic",
    modelId: "claude-sonnet-4-5",
    supportsNativeWebSearch: true,
    requiresMfjsToolSchema: true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), golden("tools"));
  assert.equal(toAiSdkTools(undefined, {}), undefined);
  assert.throws(
    () =>
      toAiSdkTools([{ name: "n", providerNative: { args: {} } }] as never, {
        providerKind: "openai",
        supportsNativeWebSearch: true,
      }),
    /Native web search is not supported by this model/u,
  );
  assert.throws(
    () =>
      toAiSdkTools(
        [
          {
            name: "refs2",
            inputSchema: { type: "object", properties: { a: { $ref: "#/$defs/missing" } } },
          },
        ] as never,
        { requiresMfjsToolSchema: true },
      ),
    /Tool refs2 has an unresolved local schema reference: #\/\$defs\/missing/u,
  );
});

test("B33 工具入参归一（含 warn 日志）", () => {
  assert.deepEqual(normalizeModelToolInput(undefined, { source: "generateText" }), {});
  assert.deepEqual(normalizeModelToolInput("", { source: "generateText" }), {});
  assert.deepEqual(normalizeModelToolInput("null", { source: "generateText" }), {});
  assert.deepEqual(normalizeModelToolInput('{"a":1}', { source: "generateText" }), { a: 1 });
  assert.equal(normalizeModelToolInput(42, { source: "generateText" }), 42);
  const warnings: unknown[] = [];
  assert.deepEqual(
    normalizeModelToolInput("broken", {
      source: "streamText",
      toolName: "tool-x",
      logger: {
        warn: (message: string, context: unknown) => warnings.push([message, context]),
      } as never,
    }),
    {},
  );
  assert.equal(warnings.length, 1);
  assert.equal((warnings[0] as [string])[0], "Invalid model tool input; using an empty object");
});

test("B34 reasoning 块的 providerOptions 透传", () => {
  assert.deepEqual(providerOptionsForReasoningBlock({ text: "x" } as never, {}), {});
  assert.deepEqual(
    providerOptionsForReasoningBlock({ text: "x", providerOptions: { a: 1 } } as never, {}),
    { providerOptions: { a: 1 } },
  );
});

test("B35 Anthropic 元数据与脱敏（金样）", async () => {
  const expected = golden("anthropic-metadata");
  const userId = await resolveAnthropicRequestMetadataUserId({
    env: {},
    providerKind: "anthropic",
    sessionId: "sess_golden",
  });
  assert.ok(typeof userId === "string");
  const parsed = JSON.parse(userId as string);
  assert.deepEqual(
    {
      device_id: parsed.device_id ? "<non-empty-device-id>" : "",
      account_uuid: parsed.account_uuid,
      session_id: parsed.session_id,
    },
    expected.userIdShape,
  );
  assert.deepEqual(
    redactAnthropicRequestMetadata({
      user_id: "u",
      userId: "u2",
      nested: { USERID: "u3", keep: "v" },
      list: [{ user: "x", uid_keep: 1 }],
    }),
    expected.redacted,
  );
  assert.equal(
    await resolveAnthropicRequestMetadataUserId({ env: {}, providerKind: "openai" }),
    undefined,
  );
});

test("B36 reasoning 历史归一与签名拒绝修复", () => {
  const messages = [
    { role: "assistant", content: [{ type: "reasoning", text: "" }] },
    {
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "keep",
          providerOptions: { item_id: "st-1", signature: "sig" },
        },
      ],
      toolCalls: [],
    },
    {
      role: "assistant",
      content: [{ type: "reasoning", text: "drop-if-openai", providerOptions: { itemId: "st-2" } }],
      toolCalls: [{ id: "c", name: "t", input: {} }],
    },
    { role: "user", content: "plain" },
  ] as never;
  const normalized = normalizeReasoningHistory(messages, {
    providerId: "prov-openai" as never,
    modelId: "m" as never,
  });
  assert.equal(normalized.length, 2);
  assert.deepEqual((normalized[0] as { content: unknown[] }).content, []);
  assert.equal((normalized[0] as { toolCalls: unknown[] }).toolCalls.length, 1);
  const kept = normalizeReasoningHistory(messages, {
    providerId: "prov" as never,
    modelId: "m" as never,
  });
  assert.equal(kept.length, 3);
  assert.deepEqual(
    (kept[0] as { content: unknown[] }).content.map((block) => (block as { text: string }).text),
    ["keep"],
  );
  const repaired = repairReasoningHistoryAfterSignatureRejection(
    [
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "x",
            providerOptions: {
              signature: "s",
              thinking_signature: "t",
              encrypted_content: "e",
              keep: 1,
            },
          },
        ],
      },
    ] as never,
    new Error("Invalid signature"),
  );
  assert.deepEqual(
    (repaired![0] as { content: { providerOptions: unknown }[] }).content[0].providerOptions,
    { keep: 1 },
  );
  assert.equal(
    repairReasoningHistoryAfterSignatureRejection(
      [{ role: "user", content: "hi" }] as never,
      new Error("unrelated"),
    ),
    undefined,
  );
});

void loadAbsolute;
void repoRoot;
