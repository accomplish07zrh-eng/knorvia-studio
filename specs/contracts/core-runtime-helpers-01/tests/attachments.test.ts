// SPDX-License-Identifier: Apache-2.0
// core-runtime-helpers-01 契约测试：回合附件解析与内联/本地媒体（B1–B7）。
// 只通过 helpers 的公开模块路径做黑盒断言；端口全部由 fixtures 注入，不读真实磁盘、不 sleep。
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { helpers, repoRoot } from "./entry.mjs";
import { createArtifactStore, createFileSystem, createLogger } from "./fixtures.js";

const trace = {
  queryId: "query-contract" as never,
  sessionId: "session-contract" as never,
  spanId: "span-contract",
  traceId: "trace-contract" as never,
  turnId: "turn-contract" as never,
};

const dataUrl = (mediaType: string, payload: string) => `data:${mediaType};base64,${payload}`;
const pdfDataUrl = () =>
  dataUrl("application/pdf", Buffer.from("%PDF-1.7\n%%EOF").toString("base64"));

const attachments = await helpers("attachments");
const dataUrlModule = await helpers("attachment-data-url");
const imageModule = await helpers("attachment-image");
const pdfModule = await helpers("attachment-pdf");
const videoModule = await helpers("attachment-video");
const placeholderModule = await helpers("attachment-placeholder");
const pathReference = await helpers("attachment-path-reference");
const artifactModule = await helpers("attachment-artifacts");
const resolverModule = await helpers("attachment-media-resolver");

test("B1 回合附件按数组顺序逐条解析，互不影响且失败降级为占位", async () => {
  const fileSystem = createFileSystem({ [resolve(repoRoot, "tmp-note.txt")]: "hello note" });
  const logger = createLogger();
  const resolved = await attachments.resolveTurnAttachments(
    [
      { content: "https://example.invalid/doc", type: "url" },
      { content: "inline text body", type: "file" },
      { path: "tmp-note.txt", type: "file" },
      { path: "missing.txt", type: "file" },
    ],
    {
      fileSystemPort: fileSystem.port,
      traceContext: trace,
      workingDirectory: repoRoot,
    },
  );

  assert.equal(resolved.length, 4, "输出与输入等长");
  assert.equal(resolved[0].contentBlock.type, "resource_link");
  assert.equal(resolved[0].mime, "text/uri-list");
  assert.equal(resolved[0].metadata.recoverability, "metadata_only");
  assert.equal(resolved[0].metadata.storageKind, "remote_ref");

  assert.equal(resolved[1].contentBlock.type, "text");
  assert.equal(resolved[1].metadata.storageKind, "inline");
  assert.equal(resolved[1].metadata.recoverability, "provider_ready");

  assert.equal(resolved[2].contentBlock.type, "text");
  assert.equal(resolved[2].contentBlock.text, "hello note");
  assert.equal(resolved[2].metadata.storageKind, "inline");
  assert.equal(resolved[2].filename, "tmp-note.txt");

  assert.equal(resolved[3].metadata.errorCode, "attachment_read_failed");
  assert.equal(resolved[3].metadata.recoverability, "metadata_only");
  assert.equal(resolved[3].metadata.storageKind, "local_ref", "带路径的失败占位算本地引用");
  assert.equal(resolved[3].contentBlock.text, "[Attached text/plain: missing.txt]");

  // 事件序列：只有带本地路径的两条会碰端口，且顺序与数组顺序一致（串行）。
  assert.deepEqual(fileSystem.ops, [
    `stat:${resolve(repoRoot, "tmp-note.txt")}`,
    `readTextFileRange:${resolve(repoRoot, "tmp-note.txt")}`,
    `stat:${resolve(repoRoot, "missing.txt")}`,
  ]);
  assert.equal(logger.records.length, 0, "解析本身不打日志");
});

test("B1 无端口/无内容的本地附件降级为读取失败占位，不抛异常", async () => {
  const resolved = await attachments.resolveTurnAttachments([{ path: "note.txt", type: "file" }], {
    traceContext: trace,
    workingDirectory: repoRoot,
  });
  assert.equal(resolved[0].metadata.errorCode, "attachment_read_failed");
  assert.equal(resolved[0].metadata.storageKind, "local_ref");
});

test("B2 事件摘要：空输入返回 undefined，文件名与 mime 按优先级推导", () => {
  assert.equal(attachments.summarizeTurnAttachmentsForEvent(undefined), undefined);
  assert.equal(attachments.summarizeTurnAttachmentsForEvent([]), undefined);

  const summary = attachments.summarizeTurnAttachmentsForEvent([
    { content: "data:image/png;base64,AAAA", filename: "shot.png", type: "image" },
    { content: "body", type: "file" },
    { content: "https://example.invalid/x", path: "ref.txt", type: "url" },
    { content: "https://example.invalid/y", type: "url" },
  ]);
  assert.equal(summary.length, 4);
  assert.deepEqual(summary[0], {
    bytes: Buffer.byteLength("data:image/png;base64,AAAA", "utf8"),
    fileName: "shot.png",
    mime: "image/png",
  });
  assert.equal(summary[1].fileName, "attachment-2", "缺文件名按序号兜底");
  assert.equal(summary[1].mime, "application/octet-stream", "无路径无类型时的兜底 mime");
  assert.equal(summary[2].mime, "text/uri-list");
  assert.equal(summary[2].ref, "ref.txt", "路径存在时引用取路径");
  assert.equal(summary[3].ref, "https://example.invalid/y", "无路径的 url 取内容");
});

test("B3 data URL 头解析与 base64 载荷校验", () => {
  assert.deepEqual(dataUrlModule.parseDataUrlHeader("data:text/plain;utf-8,abc"), {
    mediaType: "text/plain",
  });
  assert.deepEqual(dataUrlModule.parseDataUrlHeader("DATA:Image/PNG;charset=x,abc"), {
    mediaType: "image/png",
  });
  assert.equal(dataUrlModule.parseDataUrlHeader("text/plain,abc"), undefined);
  assert.equal(dataUrlModule.parseDataUrlHeader("data:,"), undefined);
  assert.equal(dataUrlModule.parseDataUrlHeader("data:text/plain"), undefined);

  assert.equal(dataUrlModule.base64PayloadByteLength("QUJD"), 3);
  assert.equal(dataUrlModule.base64PayloadByteLength("QUJDRA=="), 4);
  assert.equal(dataUrlModule.base64PayloadByteLength("QQ="), 1);

  assert.equal(dataUrlModule.isStrictBase64Payload(""), true);
  assert.equal(dataUrlModule.isStrictBase64Payload("QUJD"), true);
  assert.equal(dataUrlModule.isStrictBase64Payload("QUJD=="), false, "长度不是 4 的倍数");
  assert.equal(dataUrlModule.isStrictBase64Payload("QU=DA=="), false, "填充符混进内容段");
  assert.equal(dataUrlModule.isStrictBase64Payload("QU J"), false, "含非法字符");
  assert.equal(dataUrlModule.isStrictBase64Payload("QUJDRA="), false, "长度不是 4 的倍数");
});

test("B4 图片内联预处理与 MIME 推断", async () => {
  const original = dataUrl("image/png", "QUJD");
  const passthrough = await imageModule.prepareImageDataUrl(original, "image/png", {
    traceContext: trace,
  });
  assert.deepEqual(passthrough, { dataUrl: original, mediaType: "image/png" });

  const calls: unknown[] = [];
  const prepared = await imageModule.prepareImageDataUrl(original, "image/png", {
    imageProcessorPort: {
      async prepareForModel(input: unknown, options: unknown) {
        calls.push({ input, options });
        return {
          data: Buffer.from("resized"),
          height: 10,
          mediaType: "image/webp",
          originalHeight: 40,
          originalWidth: 60,
          resized: true,
          transformedSizeBytes: 7,
          width: 20,
        };
      },
    },
    traceContext: trace,
  });
  assert.equal(prepared.dataUrl, "data:image/webp;base64,cmVzaXplZA==");
  assert.equal(prepared.mediaType, "image/webp");
  assert.deepEqual(prepared.metadata, {
    height: 10,
    maxDimension: 2000,
    originalHeight: 40,
    originalWidth: 60,
    resized: true,
    transformedSizeBytes: 7,
    width: 20,
  });
  assert.equal(calls.length, 1);

  assert.equal(
    await imageModule.prepareImageDataUrl("data:image/png,notbase64", "image/png", {
      traceContext: trace,
    }),
    undefined,
    "非 base64 载荷返回 undefined",
  );

  assert.equal(imageModule.inferImageMimeFromPath("/a/b/PHOTO.JPG"), "image/jpeg");
  assert.equal(imageModule.inferImageMimeFromPath("c\\shot.jpeg"), "image/jpeg");
  assert.equal(imageModule.inferImageMimeFromPath("clip.webp"), "image/webp");
  assert.equal(imageModule.inferImageMimeFromPath("anim.gif"), "image/gif");
  assert.equal(imageModule.inferImageMimeFromPath("plain.png"), "image/png");
  assert.equal(imageModule.inferImageMimeFromPath("unknown.bin"), "image/png", "未知扩展名兜底");
});

test("B5 PDF 与视频的内联解析、魔数与上限常量", () => {
  assert.equal(pdfModule.PDF_INPUT_MAX_BYTES, 20 * 1024 * 1024);

  const pdf = pdfModule.parseInlinePdfDataUrl(pdfDataUrl());
  assert.equal(pdf.mediaType, "application/pdf");
  assert.equal(pdf.sizeBytes, Buffer.byteLength("%PDF-1.7\n%%EOF"));
  assert.equal(pdfModule.isPdfBytes(pdf.bytes), true);

  assert.equal(pdfModule.parseInlinePdfDataUrl(dataUrl("text/plain", "QUJD")), undefined);
  assert.equal(
    pdfModule.parseInlinePdfDataUrl("data:application/pdf,QUJD"),
    undefined,
    "缺 base64 参数",
  );
  assert.equal(
    pdfModule.parseInlinePdfDataUrl(dataUrl("application/pdf", "QUJD")),
    undefined,
    "魔数不是 %PDF-",
  );
  assert.equal(pdfModule.isPdfBytes(Buffer.from("%%PDF")), false, "不足 5 字节");
  assert.equal(pdfModule.isPdfBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), true);

  const video = videoModule.parseInlineVideoDataUrl(dataUrl("video/mp4", "QUJD"));
  assert.deepEqual(video, { mediaType: "video/mp4", sizeBytes: 3 });
  assert.equal(videoModule.parseInlineVideoDataUrl(dataUrl("audio/mp4", "QUJD")), undefined);
  assert.equal(videoModule.parseInlineVideoDataUrl(dataUrl("video/mp4", "!!")), undefined);

  assert.equal(videoModule.inferVideoMimeFromPath("/x/a.MP4"), "video/mp4");
  assert.equal(videoModule.inferVideoMimeFromPath("b.webm"), "video/webm");
  assert.equal(videoModule.inferVideoMimeFromPath("c.mov"), "video/quicktime");
  assert.equal(videoModule.inferVideoMimeFromPath("d.mkv"), "video/x-matroska");
  assert.equal(videoModule.inferVideoMimeFromPath("e.avi"), "video/x-msvideo");
  assert.equal(videoModule.inferVideoMimeFromPath("f.m4v"), "video/x-m4v");
  assert.equal(videoModule.inferVideoMimeFromPath("g.txt"), undefined);
});

test("B6 占位项与路径引用的文本、错误码与引用字段", () => {
  const placeholder = placeholderModule.resolvedPlaceholderAttachment(
    { path: "/tmp/shot.png", type: "image" },
    "/tmp/shot.png",
    "attachment_read_failed",
    { filename: "shot.png" },
  );
  assert.equal(placeholder.contentBlock.text, "[Attached image/*: /tmp/shot.png]");
  assert.equal(placeholder.metadata.errorCode, "attachment_read_failed");
  assert.equal(placeholder.metadata.storageKind, "local_ref");
  assert.equal(placeholder.metadata.recoverability, "metadata_only");
  assert.equal(placeholder.mime, "image/*");

  const inline = pathReference.resolvedInlineTextAttachment(
    { content: "body", path: "note.md", type: "file" },
    0,
  );
  assert.equal(inline.contentBlock.text, "body");
  assert.equal(inline.filename, "note.md");
  assert.equal(inline.metadata.preview.originalBytes, 4);
  assert.equal(inline.url, "note.md");

  const reference = pathReference.resolvedPathReferenceAttachment(
    { path: "big.png", type: "image" },
    "big.png",
    { filename: "big.png", mime: "image/png", reason: "image_too_large", sizeBytes: 42 },
  );
  const lines = reference.contentBlock.text.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "Attached image/png: big.png");
  assert.ok(lines[1]!.includes("larger than the inline media budget"));
  assert.equal(reference.metadata.recoverability, "metadata_only");
  assert.equal(reference.metadata.storageKind, "local_ref");

  assert.equal(pathReference.isDataOrArtifactUrl("data:text/plain,x"), true);
  assert.equal(pathReference.isDataOrArtifactUrl("knorvia-artifact://s/a"), true);
  assert.equal(pathReference.isDataOrArtifactUrl("zcode-artifact://s/a"), true, "旧 scheme 仍可读");
  assert.equal(pathReference.isDataOrArtifactUrl("/abs/path"), false);
  assert.equal(pathReference.isTextLikePath("/x/a.TS"), true);
  assert.equal(pathReference.isTextLikePath("/x/a.png"), false);
  assert.equal(pathReference.inferAttachmentMimeFromPath("a.md"), "text/markdown");
  assert.equal(pathReference.inferAttachmentMimeFromPath("a.json"), "application/json");
  assert.equal(pathReference.inferAttachmentMimeFromPath("a.csv"), "text/csv");
  assert.equal(pathReference.inferAttachmentMimeFromPath("a.pdf"), "application/pdf");
  assert.equal(pathReference.inferAttachmentMimeFromPath("a.txt"), "text/plain");
  assert.equal(pathReference.inferAttachmentMimeFromPath("a.bin"), "application/octet-stream");
  assert.equal(pathReference.inferAttachmentMimeFromPath("a.mp4"), "video/mp4");
});

test("B6 产物读写：既有 URI 复用、无产物库内联、读取失败降级", async () => {
  const store = createArtifactStore();
  const logger = createLogger();

  const reused = await artifactModule.persistAttachmentDataUrl(
    "data:text/plain,QQ==",
    0,
    "text/plain",
    {
      existingArtifactUri: "knorvia-artifact://session-contract/9",
      traceContext: trace,
    },
  );
  assert.deepEqual(reused, {
    metadata: {
      artifactUri: "knorvia-artifact://session-contract/9",
      recoverability: "provider_ready",
      storageKind: "artifact",
    },
    url: "knorvia-artifact://session-contract/9",
  });
  assert.equal(store.writes.length, 0, "既有 URI 不重复写产物");

  const inline = await artifactModule.persistAttachmentDataUrl(
    "data:text/plain,QQ==",
    0,
    "text/plain",
    {
      traceContext: trace,
    },
  );
  assert.equal(inline.metadata.storageKind, "inline");
  assert.equal(inline.url, "data:text/plain,QQ==");

  const written = await artifactModule.persistAttachmentDataUrl(
    "data:text/plain,QQ==",
    2,
    "text/plain",
    {
      artifactStore: store.port,
      sessionId: "session-contract" as never,
      traceContext: trace,
    },
  );
  assert.equal(written.metadata.storageKind, "artifact");
  assert.equal(store.writes[0].toolCallId, "attachment-3");
  assert.equal(store.writes[0].toolName, "attachment:text/plain");

  const direct = await artifactModule.readInlineAttachmentContent(
    { content: "data:text/plain,QQ==", type: "file" },
    { artifactStore: store.port, traceContext: trace },
  );
  assert.deepEqual(direct, { dataUrl: "data:text/plain,QQ==" });

  const viaArtifact = await artifactModule.readInlineAttachmentContent(
    { content: "knorvia-artifact://session-contract/1", type: "file" },
    { artifactStore: store.port, traceContext: trace },
  );
  assert.equal(viaArtifact.dataUrl, "data:text/plain,QQ==");
  assert.equal(viaArtifact.artifactUri, "knorvia-artifact://session-contract/1");

  assert.equal(
    await artifactModule.readInlineAttachmentContent(
      { content: "knorvia-artifact://session-contract/missing", type: "file" },
      { artifactStore: store.port, traceContext: trace },
    ),
    undefined,
    "产物读取失败返回 undefined 而不是抛错",
  );
  assert.equal(
    await artifactModule.readInlineAttachmentContent(
      { content: "knorvia-artifact://session-contract/1", type: "file" },
      { traceContext: trace },
    ),
    undefined,
    "缺产物库返回 undefined",
  );

  assert.equal(
    artifactModule.safeAttachmentOriginalRef({ content: "data:text/plain,QQ==", type: "file" }),
    "inline:data-url",
  );
  assert.equal(artifactModule.safeAttachmentOriginalRef({ content: "body", type: "file" }), "body");
  assert.equal(
    artifactModule.safeAttachmentOriginalRef({ path: "/a/b.txt", content: "x", type: "file" }),
    "/a/b.txt",
  );
  assert.equal(artifactModule.safeAttachmentOriginalRef({ type: "file" }), undefined);
  assert.equal(logger.records.length, 0);
});

test("B7 本地媒体分派：非文件、读取失败、图片成功、内联缩放失败与无效", async () => {
  const fileSystem = createFileSystem();
  fileSystem.binaryFiles.set(resolve(repoRoot, "pic.png"), new Uint8Array([1, 2, 3, 4]));
  fileSystem.directories.add(resolve(repoRoot, "folder"));

  const notFile = await resolverModule.resolveLocalMediaAttachment(
    { path: "folder", type: "image" },
    0,
    {
      fileSystemPort: fileSystem.port,
      traceContext: trace,
      workingDirectory: repoRoot,
    },
  );
  assert.equal(notFile.metadata.errorCode, "attachment_not_file");
  assert.equal(notFile.mime, "image/png");

  fileSystem.failNext("stat", resolve(repoRoot, "gone.png"));
  const readFailed = await resolverModule.resolveLocalMediaAttachment(
    { path: "gone.png", type: "image" },
    1,
    { fileSystemPort: fileSystem.port, traceContext: trace, workingDirectory: repoRoot },
  );
  assert.equal(readFailed.metadata.errorCode, "attachment_read_failed");

  const image = await resolverModule.resolveLocalMediaAttachment(
    { path: "pic.png", type: "image" },
    2,
    { fileSystemPort: fileSystem.port, traceContext: trace, workingDirectory: repoRoot },
  );
  assert.equal(image.contentBlock.type, "image");
  assert.equal(image.contentBlock.source.kind, "local_file");
  assert.equal(image.contentBlock.source.path, resolve(repoRoot, "pic.png"));
  assert.equal(image.mime, "image/png");
  assert.equal(image.metadata.storageKind, "inline");

  const resizeFailed = await resolverModule.resolveInlineMediaAttachment(
    { content: dataUrl("image/png", "QUJD"), type: "image" },
    0,
    "image/png",
    {
      imageProcessorPort: {
        async prepareForModel() {
          throw new Error("processor exploded");
        },
      },
      traceContext: trace,
    },
  );
  assert.equal(resizeFailed.metadata.errorCode, "attachment_image_resize_failed");

  const invalid = await resolverModule.resolveInlineMediaAttachment(
    { content: "data:image/png,plain", type: "image" },
    1,
    "image/png",
    { traceContext: trace },
  );
  assert.equal(invalid.metadata.errorCode, "attachment_image_invalid");

  const pdfInline = await resolverModule.resolveInlineMediaAttachment(
    { content: pdfDataUrl(), filename: "doc.pdf", type: "pdf" },
    2,
    "application/pdf",
    { traceContext: trace },
  );
  assert.equal(pdfInline.contentBlock.type, "file");
  assert.equal(pdfInline.mime, "application/pdf");
  assert.equal(pdfInline.metadata.sizeBytes, Buffer.byteLength("%PDF-1.7\n%%EOF"));

  const badPdf = await resolverModule.resolveInlineMediaAttachment(
    { content: dataUrl("application/pdf", "QUJD"), type: "pdf" },
    3,
    "application/pdf",
    { traceContext: trace },
  );
  assert.equal(badPdf.metadata.errorCode, "attachment_pdf_invalid");

  const notMedia = await resolverModule.resolveInlineMediaAttachment(
    { content: "just text", type: "file" },
    4,
    undefined,
    { traceContext: trace },
  );
  assert.equal(notMedia, undefined, "非媒体内联交回上层回退");
});
