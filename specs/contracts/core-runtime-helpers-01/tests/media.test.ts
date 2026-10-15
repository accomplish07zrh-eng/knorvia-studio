// SPDX-License-Identifier: Apache-2.0
// core-runtime-helpers-01 契约测试：媒体能力、体积预算、压缩占位与观测（B8–B13）。
import assert from "node:assert/strict";
import test from "node:test";
import { coreDeps, helpers } from "./entry.mjs";
import { createArtifactStore, createLogger, createSessionStore } from "./fixtures.js";

const deps = await coreDeps();
const capability = await helpers("media-capability");
const budget = await helpers("media-budget");
const compactMedia = await helpers("compact-media");
const attachmentPath = await helpers("media-attachment-path");
const toolMedia = await helpers("tool-result-media-persistence");
const observability = await helpers("media-observability");
const cuaMedia = await helpers("official-cua-media");

const trace = { spanId: "span", traceId: "trace" };

const imageBlock = (payload = "QUJD", mediaType = "image/png") => ({
  dataUrl: `data:${mediaType};base64,${payload}`,
  mediaType,
  source: { id: "img-1", kind: "inline", mimeType: mediaType, placeholder: "shot.png" },
  type: "image" as const,
});
const videoBlock = () => ({
  dataUrl: "data:video/mp4;base64,QUJD",
  mediaType: "video/mp4",
  type: "video" as const,
});
const textBlock = (text: string) => ({ text, type: "text" as const });
const userMessage = (content: unknown) => ({ content, role: "user" as const });
const allCapabilities = {
  supportsAudio: false,
  supportsImage: true,
  supportsPdf: true,
  supportsText: true,
  supportsVideo: true,
};

test("B8 能力投影：三类全支持时原样返回，缺一类即替换并分类计数", () => {
  const messages = [userMessage([textBlock("hi"), imageBlock(), videoBlock()])];
  const full = capability.projectMessagesForInputFormat(messages, allCapabilities);
  assert.equal(full.messages, messages, "全支持时保持原数组引用");
  assert.equal(full.omittedMediaCount, 0);
  assert.equal(full.retainedMediaCount, 2);

  const noImage = capability.projectMessagesForInputFormat(messages, {
    ...allCapabilities,
    supportsImage: false,
  });
  assert.notEqual(noImage.messages, messages, "发生替换时返回新数组");
  assert.equal(noImage.omittedImageCount, 1);
  assert.equal(noImage.omittedMediaCount, 1);
  assert.equal(noImage.omittedPdfCount, 0);
  assert.equal(noImage.omittedVideoCount, 0);
  assert.equal(noImage.retainedMediaCount, 1);
  assert.equal(noImage.messages[0].content[1].type, "text");
  assert.equal(noImage.messages[0].content[0].type, "text");
  assert.notEqual(noImage.messages[0].content[0], messages[0].content[0], "未变块也走克隆");

  const logger = createLogger();
  capability.logMediaCapabilityProjection(logger, trace, noImage, {
    event: "model.request.media_capability",
    message: "media omitted",
    model: "provider-test/model-test",
  });
  assert.equal(logger.records.length, 1);
  assert.equal(logger.records[0].level, "debug");
  const context = logger.records[0].context[0] as Record<string, unknown>;
  assert.equal(context.event, "model.request.media_capability");
  assert.equal(context.model, "provider-test/model-test");
  assert.equal(context.omittedImageCount, 1);

  const quiet = createLogger();
  capability.logMediaCapabilityProjection(quiet, trace, full, {
    event: "model.request.media_capability",
    message: "media omitted",
    model: "provider-test/model-test",
  });
  assert.equal(quiet.records.length, 0, "无省略不打日志");
});

test("B9 媒体预算：不超限原样返回；超限时新者优先、受保护消息保留", () => {
  const messages = [userMessage([imageBlock("AAAA")]), userMessage([imageBlock("BBBB")])];
  const under = budget.projectMessagesForMediaBudget(messages, { maxMediaBytes: 1024 });
  assert.equal(under.messages, messages, "不超限保持原引用");
  assert.equal(under.omittedMediaCount, 0);
  assert.equal(under.totalMediaBytes, Buffer.byteLength("data:image/png;base64,AAAA", "utf8") * 2);
  assert.equal(under.projectedMediaBytes, under.totalMediaBytes);
  assert.equal(under.retainedMediaCount, 2);

  const mediaBytes = Buffer.byteLength("data:image/png;base64,AAAA", "utf8");
  const limited = budget.projectMessagesForMediaBudget(messages, { maxMediaBytes: mediaBytes + 1 });
  assert.equal(limited.totalMediaBytes, mediaBytes * 2);
  assert.equal(limited.omittedMediaCount, 1, "只放得下一条");
  assert.equal(limited.retainedMediaCount, 1);
  assert.equal(limited.projectedMediaBytes, mediaBytes);
  // 受保护的是「最近的真实用户消息」= 下标 1（更新的那条），所以更旧的下标 0 被替换。
  assert.equal(limited.messages[0].content[0].type, "text");
  assert.ok(
    limited.messages[0].content[0].text.includes(
      "[Media omitted from provider request to keep the request body under the configured media budget.]",
    ),
    "省略说明文案是契约",
  );
  assert.equal(limited.messages[1].content[0].type, "image");

  const explicitProtection = budget.projectMessagesForMediaBudget(messages, {
    latestRealUserMessageIndex: 0,
    maxMediaBytes: mediaBytes + 1,
  });
  assert.equal(explicitProtection.messages[0].content[0].type, "image");
  assert.equal(explicitProtection.messages[1].content[0].type, "text");

  const off = budget.projectMessagesForMediaBudget(messages, {
    maxMediaBytes: mediaBytes + 1,
    preserveLatestUserMedia: false,
  });
  assert.equal(off.retainedMediaCount, 1, "关闭保护后同样只保留一条");
});

test("B9 媒体预算：非法上限与受保护消息超限的错误语义", () => {
  const messages = [userMessage([imageBlock()])];
  assert.throws(
    () => budget.projectMessagesForMediaBudget(messages, { maxMediaBytes: -1 }),
    (error: { context?: Record<string, unknown>; type?: string }) => {
      assert.equal(error.type, deps.CoreErrorType.ConfigurationError);
      assert.equal(error.context.maxMediaBytes, -1);
      return true;
    },
  );
  assert.throws(
    () => budget.projectMessagesForMediaBudget(messages, { maxMediaBytes: Number.NaN }),
    (error: { context?: Record<string, unknown>; type?: string }) => {
      assert.equal(error.type, deps.CoreErrorType.ConfigurationError);
      return true;
    },
  );

  const tooLarge = Buffer.byteLength("data:image/png;base64,AAAA", "utf8");
  assert.throws(
    () =>
      budget.projectMessagesForMediaBudget(messages, {
        latestRealUserMessageIndex: 0,
        maxMediaBytes: tooLarge - 1,
      }),
    (error: {
      code?: string;
      context?: Record<string, unknown>;
      message?: string;
      type?: string;
    }) => {
      assert.equal(error.type, deps.CoreErrorType.InvalidInput);
      assert.equal(
        error.code,
        deps.MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE,
        "固定错误码是协议面",
      );
      assert.equal(error.context.protectedMediaBytes, tooLarge);
      assert.equal(error.context.maxMediaBytes, tooLarge - 1);
      assert.ok(error.message.startsWith("Current attachments are too large to send."));
      return true;
    },
  );
});

test("B9 组合投影与预算日志", () => {
  const messages = [userMessage([imageBlock(), textBlock("body")])];
  const projection = budget.projectMessagesForModelMediaPolicy(messages, {
    ...allCapabilities,
    supportsImage: false,
  });
  assert.equal(projection.capabilityProjection.omittedImageCount, 1);
  assert.equal(projection.messages, projection.mediaBudgetProjection.messages);
  assert.equal(projection.capabilityProjection.omittedMediaCount, 1, "能力投影先于预算投影执行");

  const logger = createLogger();
  budget.logMediaBudgetProjection(logger, trace, projection.mediaBudgetProjection, {
    event: "model.request.media_budget",
    message: "budget applied",
  });
  assert.equal(logger.records.length, 0, "无省略不打日志");

  const forced = budget.projectMessagesForMediaBudget([userMessage([imageBlock()])], {
    maxMediaBytes: 1,
    preserveLatestUserMedia: false,
  });
  const active = createLogger();
  budget.logMediaBudgetProjection(active, trace, forced, {
    event: "model.request.media_budget",
    message: "budget applied",
  });
  assert.equal(active.records.length, 1);
  assert.equal(active.records[0].level, "debug");
  const context = active.records[0].context[0] as Record<string, unknown>;
  assert.equal(context.event, "model.request.media_budget");
  assert.equal(context.module, "core.runtime");
  assert.equal(context.omittedMediaCount, 1);
});

test("B10 压缩重试的媒体占位投影", () => {
  const messages = [
    {
      content: [
        imageBlock(),
        videoBlock(),
        {
          dataUrl: "data:application/pdf;base64,QUJD",
          mediaType: "application/pdf",
          type: "file" as const,
        },
        { text: "keep", type: "text" as const },
        {
          text: "doc",
          type: "file" as const,
          mediaType: "text/plain",
          dataUrl: undefined as string | undefined,
        },
      ],
      role: "user" as const,
    },
    { content: "plain", role: "assistant" as const },
  ];
  const projection = compactMedia.projectCompactMediaForRetry(messages);
  assert.equal(projection.replacedMediaCount, 3);
  assert.deepEqual(
    projection.messages[0].content.map((block: { type: string; text?: string }) => [
      block.type,
      block.text,
    ]),
    [
      ["text", "[image]"],
      ["text", "[video]"],
      ["text", "[document]"],
      ["text", "keep"],
      ["file", "doc"],
    ],
  );
  assert.equal(projection.messages[1], messages[1], "无媒体的消息保持原引用");

  const logger = createLogger();
  compactMedia.logCompactMediaRetryProjection(logger, trace, projection);
  assert.equal(logger.records.length, 1);
  const context = logger.records[0].context[0] as Record<string, unknown>;
  assert.equal(context.event, "compact.request.media_placeholder_projection");
  assert.equal(context.replacedMediaCount, 3);

  const quiet = createLogger();
  compactMedia.logCompactMediaRetryProjection(
    quiet,
    trace,
    compactMedia.projectCompactMediaForRetry([{ content: "x", role: "user" }]),
  );
  assert.equal(quiet.records.length, 0);
});

test("B11 附件路径物化：本地路径直取、artifact 经产物库、unsupported 跳过、缺失即抛", async () => {
  const store = createArtifactStore();
  store.ensurePath = { path: "C:\\data\\shot.png" };

  const local = await attachmentPath.projectMessagesWithMediaAttachmentPaths(
    [
      {
        content: [
          {
            mediaType: "image/png",
            source: {
              id: "i",
              kind: "local_file",
              path: "/workspace/shot.png",
              placeholder: "shot.png",
            },
            type: "image",
          },
        ],
        role: "user",
      },
      {
        content: [
          {
            mediaType: "image/png",
            source: { id: "j", kind: "local_file", path: "/other.png" },
            type: "image",
          },
        ],
        role: "assistant",
      },
    ],
    undefined,
  );
  assert.equal(local[0].content[0].source.path, "/workspace/shot.png");
  assert.equal(local[0].content[1].type, "text");
  assert.equal(local[0].content[1].text, "[Image: source: /workspace/shot.png]");
  assert.equal(local[1].content[0].source.path, "/other.png", "非 user 消息不加注记");
  assert.equal(local[1].content.length, 1);

  const materialized = await attachmentPath.projectMessagesWithMediaAttachmentPaths(
    [
      {
        content: [
          {
            mediaType: "image/png",
            source: {
              id: "i",
              kind: "inline",
              uri: "knorvia-artifact://session-contract/1",
              placeholder: "shot.png",
            },
            type: "image",
          },
        ],
        role: "user",
      },
    ],
    store.port,
  );
  assert.equal(materialized[0].content[0].source.path, "C:\\data\\shot.png");
  assert.equal(materialized[0].content[1].text, "[Image: source: C:\\data\\shot.png]");

  store.ensurePath = { path: "", status: "unsupported" };
  const unsupported = await attachmentPath.projectMessagesWithMediaAttachmentPaths(
    [
      {
        content: [
          {
            mediaType: "image/png",
            source: { id: "i", kind: "inline", uri: "knorvia-artifact://session-contract/1" },
            type: "image",
          },
        ],
        role: "user",
      },
    ],
    store.port,
  );
  assert.ok(Array.isArray(unsupported[0].content));
  assert.equal(unsupported[0].content.length, 1, "unsupported 不加注记");

  await assert.rejects(
    () =>
      attachmentPath.projectMessagesWithMediaAttachmentPaths(
        [
          {
            content: [
              {
                mediaType: "image/png",
                source: { id: "i", kind: "inline", uri: "knorvia-artifact://session-contract/2" },
                type: "image",
              },
            ],
            role: "user",
          },
        ],
        undefined,
      ),
    (error: Error) => {
      assert.match(error.message, /^Unable to materialize image attachment path: /);
      return true;
    },
  );
});

test("B12 工具结果媒体落盘：布局表、既有 URI 复用与缺失端口错误", async () => {
  const store = createArtifactStore();
  const base = {
    assistantMessageId: "msg-1" as never,
    sessionId: "session-contract" as never,
    toolCallId: "call-1",
    toolName: "Read",
    traceContext: trace,
    turnId: "turn-1" as never,
  };

  assert.equal(
    await toolMedia.persistToolResultMediaAttachments({ ...base, content: "plain text" }),
    undefined,
    "纯文本返回 undefined",
  );
  assert.equal(
    await toolMedia.persistToolResultMediaAttachments({
      ...base,
      content: [imageBlock()],
    }),
    undefined,
    "缺会话存储返回 undefined",
  );
  await assert.rejects(
    () =>
      toolMedia.persistToolResultMediaAttachments({
        ...base,
        artifactStore: undefined,
        content: [textBlock("hello"), imageBlock()],
        sessionStore: createSessionStore().port,
      }),
    (error: Error) => {
      assert.equal(error.message, "Cannot persist tool result media without an artifact store");
      return true;
    },
  );

  const persisted = await toolMedia.persistToolResultMediaAttachments({
    ...base,
    artifactStore: store.port,
    sessionStore: createSessionStore().port,
    content: [textBlock("hello"), imageBlock(), videoBlock()],
  });
  assert.equal(persisted.attachments.length, 2);
  assert.equal(persisted.attachments[0].type, "file");
  assert.equal(persisted.attachments[0].mime, "image/png");
  assert.equal(persisted.attachments[0].messageID, "msg-1");
  assert.equal(persisted.attachments[0].sessionID, "session-contract");
  assert.match(persisted.attachments[0].url, /^knorvia-artifact:\/\/session-contract\//);
  assert.equal(persisted.attachments[0].metadata.storageKind, "artifact");
  assert.deepEqual(
    persisted.modelContentLayout,
    [
      { text: "hello", type: "text" },
      { attachmentIndex: 0, type: "attachment" },
      { attachmentIndex: 1, type: "attachment" },
    ],
    "布局表记录文本与附件的相对位置",
  );
  assert.deepEqual(
    store.writes.map((write) => write.toolCallId),
    ["call-1-media-1", "call-1-media-2"],
    "写入顺序与内容块顺序一致（串行）",
  );
  assert.deepEqual(
    store.writes.map((write) => write.toolName),
    ["Read", "Read"],
  );

  const before = store.writes.length;
  const reused = await toolMedia.persistToolResultMediaAttachments({
    ...base,
    artifactStore: store.port,
    sessionStore: createSessionStore().port,
    content: [
      {
        dataUrl: "data:image/png;base64,QUJD",
        mediaType: "image/png",
        source: {
          id: "i",
          kind: "inline",
          placeholder: "shot.png",
          uri: "knorvia-artifact://session-contract/1",
        },
        type: "image",
      },
    ],
  });
  assert.equal(
    reused.attachments[0].url,
    "knorvia-artifact://session-contract/1",
    "既有 URI 直接复用",
  );
  assert.equal(store.writes.length, before, "复用不重复写产物");
});

test("B13 媒体观测：附件与请求摘要都只在有媒体时打 debug", () => {
  const logger = createLogger();
  observability.logResolvedTurnAttachments(logger, trace, []);
  assert.equal(logger.records.length, 0);

  observability.logResolvedTurnAttachments(logger, trace, [
    {
      contentBlock: imageBlock(),
      metadata: { recoverability: "provider_ready", sizeBytes: 6, storageKind: "artifact" },
      mime: "image/png",
      url: "knorvia-artifact://session-contract/1",
    },
    {
      contentBlock: textBlock("[Attached image/png: shot.png]"),
      metadata: {
        errorCode: "attachment_read_failed",
        recoverability: "metadata_only",
        storageKind: "local_ref",
      },
      mime: "image/png",
      url: "shot.png",
    },
  ]);
  assert.equal(logger.records.length, 1);
  const context = logger.records[0].context[0] as Record<string, unknown>;
  assert.equal(context.event, "turn.attachments.resolved");
  assert.equal(context.attachmentCount, 2);
  assert.equal(context.imageAttachmentCount, 1);
  assert.equal(context.textFallbackAttachmentCount, 1);
  const summaries = context.attachments as { errorCode?: string; urlKind: string }[];
  assert.equal(summaries[0].urlKind, "artifact");
  assert.equal(summaries[1].errorCode, "attachment_read_failed");

  const quiet = createLogger();
  observability.logModelRequestMediaSummary(quiet, trace, {
    incomingMessages: [userMessage("hi")],
    mediaProjection: {
      messages: [],
      omittedMediaCount: 0,
      projectedMediaBytes: 0,
      retainedMediaCount: 0,
      totalMediaBytes: 0,
    },
    providerMessages: [userMessage("hi")],
  });
  assert.equal(quiet.records.length, 0, "没有媒体块不打日志");

  const active = createLogger();
  observability.logModelRequestMediaSummary(active, trace, {
    incomingMessages: [userMessage([imageBlock()])],
    mediaProjection: {
      messages: [],
      omittedMediaCount: 1,
      projectedMediaBytes: 0,
      retainedMediaCount: 0,
      totalMediaBytes: 10,
    },
    providerMessages: [userMessage([imageBlock()])],
  });
  assert.equal(active.records.length, 1);
  const summary = active.records[0].context[0] as Record<string, unknown>;
  assert.equal(summary.event, "model.request.media_summary");
  assert.equal(summary.incomingMediaBlockCount, 1);
  assert.equal(summary.providerMediaBlockCount, 1);
  assert.equal(summary.incomingMediaBlocksTruncated, false);
});

test("B8 官方 CUA 配对：只认紧随其后的凭据文本，替换块文案固定", () => {
  const content = [imageBlock(), textBlock("ordinary caption")];
  assert.deepEqual(
    [...cuaMedia.officialCuaImageRefIndexesForUnavailableMedia(content, new Set([0]))],
    [],
    "非凭据文本不参与配对",
  );
  const block = cuaMedia.officialCuaRasterUnavailableBlock();
  assert.equal(block.type, "text");
  assert.equal(
    block.text,
    "This CUA raster is not visible in this request. " +
      "Do not send a coordinate target; capture a new raster first.",
  );
});
