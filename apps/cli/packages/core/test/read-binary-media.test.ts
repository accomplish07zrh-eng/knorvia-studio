// Synthetic media adapter contracts; repository transition licence retained.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  READ_IMAGE_MAX_BASE64_BYTES,
  READ_IMAGE_MAX_DIMENSION,
  READ_IMAGE_MAX_INPUT_BYTES,
  READ_IMAGE_TARGET_BYTES,
  READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO,
  READ_MAX_OUTPUT_TOKENS,
  READ_VIDEO_MAX_INPUT_BYTES,
  createFileSystemError,
  createImageProcessorError,
  type CoreError,
  type ImageProcessorErrorCode,
  type ReadImageOutput,
} from "@knorvia/contracts";
import { inferImageMimeFromPath, readImageFile } from "../src/tool/handlers/read-image.js";
import { readVideoFile } from "../src/tool/handlers/read-video.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

const path = "/synthetic/media";
function fixture() {
  const raw = new Uint8Array([11, 22, 33, 44]).subarray(1, 3);
  const cooked = new Uint8Array([1, 2, 3, 4, 5]).subarray(1, 4);
  const read = { content: raw, bytesRead: 2, sizeBytes: 99, path };
  const prepared = {
    data: cooked,
    mediaType: "image/webp",
    originalSizeBytes: 888,
    transformedSizeBytes: 3,
    resized: true,
    compressed: true,
    strategy: "preserve-format",
    originalWidth: 100,
    originalHeight: 200,
    width: 10,
    height: 20,
  };
  const calls: { kind: string; args: unknown[] }[] = [];
  const controller = new AbortController();
  const context = {
    toolCallId: "call",
    traceId: "trace",
    spanId: "span",
    parentSpanId: "parent",
    sessionId: "session",
    turnId: "turn",
    abortSignal: controller.signal,
    fileSystemPort: {
      readBinaryFile: async (...args: unknown[]) => {
        calls.push({ kind: "read", args });
        return read;
      },
    },
    imageProcessorPort: {
      prepareForModel: async (...args: unknown[]) => {
        calls.push({ kind: "prepare", args });
        return prepared;
      },
    },
  } as unknown as ToolExecutionContext;
  return { context, raw, cooked, read, prepared, calls, controller };
}
const trace = {
  traceId: "trace",
  spanId: "span",
  parentSpanId: "parent",
  sessionId: "session",
  turnId: "turn",
};

for (const kind of ["image", "video"]) {
  test(`${kind} missing filesystem rejects before any media work`, async () => {
    const f = fixture();
    f.context.fileSystemPort = undefined;
    const run =
      kind === "image"
        ? readImageFile(path, "image/png", f.context)
        : readVideoFile(path, "video/mp4", f.context);
    await assert.rejects(run, (error) => {
      const e = error as CoreError;
      assert.equal(e.type, CoreErrorType.ConfigurationError);
      assert.equal(e.message, "FileSystemPort is not configured for Read tool");
      assert.equal(e.recoverable, false);
      assert.deepEqual(e.context, { toolCallId: "call", toolName: "Read" });
      return true;
    });
    assert.deepEqual(f.calls, []);
  });
}

test("image processor absence rejects before reading, after filesystem admission", async () => {
  const f = fixture();
  f.context.imageProcessorPort = undefined;
  await assert.rejects(readImageFile(path, "image/png", f.context), {
    message: "ImageProcessorPort is not configured for image Read",
  });
  assert.deepEqual(f.calls, []);
});

test("image passes exact budgets, signal and one trace object then projects prepared facts", async () => {
  const f = fixture();
  const output = await readImageFile(path, "image/png", f.context);
  assert.deepEqual(f.calls, [
    {
      kind: "read",
      args: [
        { path, maxBytes: READ_IMAGE_MAX_INPUT_BYTES, trace },
        { signal: f.controller.signal },
      ],
    },
    {
      kind: "prepare",
      args: [
        {
          data: f.raw,
          mediaType: "image/png",
          maxBase64Bytes: READ_IMAGE_MAX_BASE64_BYTES,
          maxDimension: READ_IMAGE_MAX_DIMENSION,
          maxRawBytes: READ_IMAGE_TARGET_BYTES,
          maxTokens: READ_MAX_OUTPUT_TOKENS,
          tokenToBase64CharRatio: READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO,
          trace,
        },
        { signal: f.controller.signal },
      ],
    },
  ]);
  assert.equal(
    (f.calls[0]!.args[0] as { trace: unknown }).trace,
    (f.calls[1]!.args[0] as { trace: unknown }).trace,
  );
  assert.deepEqual(output, {
    type: "image",
    base64: "AgME",
    mimeType: "image/webp",
    originalSize: 99,
    transformedSize: 3,
    resized: true,
    compressed: true,
    compressionStrategy: "preserve-format",
    dimensions: { originalWidth: 100, originalHeight: 200, displayWidth: 10, displayHeight: 20 },
  });
});

for (const mime of [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "IMAGE/PNG",
  "",
]) {
  test(`prepared MIME ${JSON.stringify(mime)} follows the existing allowlist`, async () => {
    const f = fixture();
    f.prepared.mediaType = mime;
    const output = await readImageFile(path, "image/gif", f.context);
    assert.equal(
      output.mimeType,
      ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime) ? mime : "image/gif",
    );
  });
}

test("missing dimensions remain explicit undefined fields", async () => {
  const f = fixture();
  for (const field of ["originalWidth", "originalHeight", "width", "height"])
    delete (f.prepared as Record<string, unknown>)[field];
  const output = await readImageFile(path, "image/png", f.context);
  assert.deepEqual(output.dimensions, {
    originalWidth: undefined,
    originalHeight: undefined,
    displayWidth: undefined,
    displayHeight: undefined,
  });
});

for (const kind of ["image", "video"]) {
  test(`${kind} maps only the typed oversized input failure and retains cause`, async () => {
    const f = fixture();
    const error = createFileSystemError({ code: "too_large", message: "fixture size refusal" });
    f.context.fileSystemPort!.readBinaryFile = async () => {
      throw error;
    };
    await assert.rejects(
      kind === "image"
        ? readImageFile(path, "image/png", f.context)
        : readVideoFile(path, "video/mp4", f.context),
      (caught) => {
        const e = caught as CoreError;
        assert.equal(e.cause, error);
        assert.equal(e.message, error.message);
        assert.equal(e.type, CoreErrorType.ToolExecutionFailed);
        assert.equal(e.recoverable, true);
        assert.deepEqual(e.context, {
          code: `read_${kind}_input_too_large`,
          filePath: path,
          maxBytes: kind === "image" ? READ_IMAGE_MAX_INPUT_BYTES : READ_VIDEO_MAX_INPUT_BYTES,
          toolCallId: "call",
          toolName: "Read",
        });
        return true;
      },
    );
  });
  test(`${kind} leaves cancellation, ordinary and lookalike errors untouched`, async () => {
    for (const error of [
      new Error("fixture failure"),
      createFileSystemError({ code: "cancelled", message: "stop" }),
      { code: "too_large", message: "not an adapter error" },
      undefined,
    ]) {
      const f = fixture();
      f.context.fileSystemPort!.readBinaryFile = async () => {
        throw error;
      };
      let resolved = false;
      try {
        await (kind === "image"
          ? readImageFile(path, "image/png", f.context)
          : readVideoFile(path, "video/mp4", f.context));
        resolved = true;
      } catch (caught) {
        assert.equal(caught, error);
      }
      assert.equal(resolved, false);
    }
  });
}

for (const code of [
  "empty",
  "invalid_request",
  "processing_failed",
  "too_large",
  "unsupported",
] as ImageProcessorErrorCode[]) {
  test(`image maps processor ${code} with the complete budget context`, async () => {
    const f = fixture();
    const error = createImageProcessorError({ code, message: `fixture ${code}` });
    f.context.imageProcessorPort!.prepareForModel = async () => {
      throw error;
    };
    await assert.rejects(readImageFile(path, "image/png", f.context), (caught) => {
      const e = caught as CoreError;
      assert.equal(e.cause, error);
      assert.equal(e.recoverable, true);
      assert.equal(e.message, error.message);
      assert.deepEqual(e.context, {
        code: `read_image_${code}`,
        filePath: path,
        maxBase64Bytes: READ_IMAGE_MAX_BASE64_BYTES,
        maxDimension: READ_IMAGE_MAX_DIMENSION,
        maxInputBytes: READ_IMAGE_MAX_INPUT_BYTES,
        maxRawBytes: READ_IMAGE_TARGET_BYTES,
        maxTokens: READ_MAX_OUTPUT_TOKENS,
        toolCallId: "call",
        toolName: "Read",
      });
      return true;
    });
  });
}

test("image preserves ordinary processor errors and reacquires the processor after IO", async () => {
  const f = fixture();
  const error = new Error("replacement processor");
  f.context.fileSystemPort!.readBinaryFile = async () => {
    f.context.imageProcessorPort = {
      ...f.context.imageProcessorPort!,
      prepareForModel: async () => {
        throw error;
      },
    };
    return f.read;
  };
  await assert.rejects(readImageFile(path, "image/png", f.context), (caught) => caught === error);
});

test("video copies only the selected byte view, keeps MIME and does not prepare images", async () => {
  const f = fixture();
  assert.deepEqual(await readVideoFile(path, "video/webm", f.context), {
    type: "video",
    base64: "FiE=",
    mimeType: "video/webm",
    originalSize: 99,
  });
  assert.deepEqual(f.calls, [
    {
      kind: "read",
      args: [
        { path, maxBytes: READ_VIDEO_MAX_INPUT_BYTES, trace },
        { signal: f.controller.signal },
      ],
    },
  ]);
});

test("video empty detection follows bytesRead rather than inventing new adapter validation", async () => {
  const f = fixture();
  f.read.bytesRead = 0;
  await assert.rejects(readVideoFile(path, "video/mp4", f.context), (caught) => {
    const e = caught as CoreError;
    assert.equal(e.message, "Cannot read an empty video file.");
    assert.deepEqual(e.context, {
      code: "read_video_input_empty",
      filePath: path,
      toolCallId: "call",
      toolName: "Read",
    });
    assert.equal(e.recoverable, true);
    return true;
  });
  f.read.content = new Uint8Array();
  f.read.bytesRead = 1;
  assert.equal((await readVideoFile(path, "video/mp4", f.context)).base64, "");
});

for (const [name, expected] of [
  ["a.JPG", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  ["C:\\x.PNG", "image/png"],
  ["a.gif", "image/gif"],
  ["a.WEBP", "image/webp"],
  ["png", undefined],
  ["a.png?x", undefined],
  ["a.png.txt", undefined],
  ["a.svg", undefined],
  ["", undefined],
] as const) {
  test(`image path inference retains ${JSON.stringify(name)}`, () => {
    assert.equal(inferImageMimeFromPath(name), expected as ReadImageOutput["mimeType"] | undefined);
  });
}
