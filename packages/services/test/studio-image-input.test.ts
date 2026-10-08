import { syntheticImage } from "./fixtures/studio-image-data.js";
import assert from "node:assert/strict";
import { crc32, deflateSync } from "node:zlib";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Event } from "@knorvia/rpc";
import type {
  StudioCommand,
  StudioImageInput,
  StudioKernelOptions,
} from "../src/studio-runtime/contract.js";
import { studioImageCodec } from "../src/studio-runtime/adapters/imageCodec.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { admitStudioCommand } from "../src/studio-runtime/app/commandAdmission.js";
import { setup } from "./studio-kernels-model.fixture.js";

const options: StudioKernelOptions = {
  defaultModel: "vision",
  models: [{ id: "vision", label: "Vision", reasoning: [], inputModalities: ["text", "image"] }],
};
async function fixture(imageCodec = true) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-image-test-"));
  const file = join(directory, "studio.sqlite");
  let db = new StudioDatabase(file);
  let currentOptions = options;
  let inspect: (() => Promise<StudioKernelOptions>) | undefined;
  const turns: StudioImageInput[][] = [];
  const make = () =>
    new StudioRuntimeService({
      db,
      images: imageCodec ? studioImageCodec : undefined,
      clock: { now: Date.now, id: randomUUID, delay: async () => {} },
      kernels: {
        options: async () => (inspect ? inspect() : currentOptions),
        adapter: () => ({
          run: async (turn) => {
            turns.push(turn.attachments ?? []);
            return { status: "succeeded", text: "pixel receipt", resultKnown: true };
          },
        }),
        inspect: async () => [],
        manage: async () => {
          throw new Error("unused");
        },
        dispose: async () => {},
      },
      workspaces: {
        prepare: async ({ sourcePath }) => sourcePath,
        changes: async () => [],
        apply: async () => {},
      },
      onDidChange: Event.None,
      notify: () => {},
    });
  let service = make();
  await service.command({
    commandId: randomUUID(),
    type: "create-conversation",
    id: "chat",
    kernel: "codex",
    workspacePath: directory,
  });
  const command = (images = [syntheticImage()], text = ""): StudioCommand => ({
    commandId: randomUUID(),
    type: "send",
    kind: "chat",
    targetId: "chat",
    text,
    attachments: images,
  });
  return {
    get db() {
      return db;
    },
    get service() {
      return service;
    },
    command,
    turns,
    options: (value: StudioKernelOptions) => {
      currentOptions = value;
    },
    inspect: (value: () => Promise<StudioKernelOptions>) => {
      inspect = value;
    },
    restart: async () => {
      await service.disposeAllAndWait();
      db = new StudioDatabase(file);
      service = make();
    },
    cleanup: async () => {
      await service.disposeAllAndWait();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("PNG/JPEG actual decoding rejects wrong MIME, hash, dimensions, CRC, truncation and budgets", () => {
  for (const format of ["png", "jpeg"] as const) studioImageCodec.validate(syntheticImage(format));
  const image = syntheticImage();
  for (const bad of [
    { ...image, mimeType: "image/jpeg" as const },
    { ...image, sha256: "0".repeat(64) },
    { ...image, width: 3 },
    { ...image, dataBase64: "AAAA" },
    { ...image, sizeBytes: 2 * 1024 * 1024 + 1 },
    { ...image, width: 8193 },
    { ...image, width: 8192, height: 8192 },
  ])
    assert.throws(() => studioImageCodec.validate(bad));
  assert.throws(() =>
    studioImageCodec.validate({
      ...image,
      accountConfig: { token: "untrusted" },
    } as StudioImageInput),
  );
  const broken = Buffer.from(image.dataBase64, "base64");
  broken[broken.length - 1] ^= 1;
  assert.throws(() =>
    studioImageCodec.validate({
      ...image,
      dataBase64: broken.toString("base64"),
      sha256: createHash("sha256").update(broken).digest("hex"),
    }),
  );
});

test("interlaced PNG decodes actual pixels and bounded inflate rejects oversized decoded content", () => {
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type),
      length = Buffer.alloc(4),
      crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  header[12] = 1;
  const create = (raw: Buffer): StudioImageInput => {
    const bytes = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    return {
      ...syntheticImage(),
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      dataBase64: bytes.toString("base64"),
    };
  };
  studioImageCodec.validate(create(Buffer.from([0, 127, 11, 31, 255, 0, 33, 77, 201, 255])));
  assert.throws(() => studioImageCodec.validate(create(Buffer.alloc(16384))), /解压/);
});

test("missing Host codec is explicitly unsupported and native catalog errors redact credentials", async () => {
  const f = await fixture(false);
  try {
    assert.match((await f.service.command(f.command())).imageRejection!, /解码能力/);
    assert.equal(f.db.list("run").length, 0);
  } finally {
    await f.cleanup();
  }
  const guarded = await fixture();
  try {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
    guarded.inspect(async () => {
      throw new Error(`apiKey=${secret}`);
    });
    const result = await guarded.service.command(guarded.command());
    assert.ok(result.imageRejection);
    assert.equal(result.imageRejection.includes(secret), false);
    assert.equal(guarded.db.list("run").length, 0);
  } finally {
    await guarded.cleanup();
  }
});

test("durable original image command dedupes concurrent/lost ACK/restart; scoped refs retrieve full bytes", async () => {
  const f = await fixture();
  try {
    const input = f.command([syntheticImage(), syntheticImage("jpeg")], "compare pixels");
    const [first, duplicate] = await Promise.all([
      f.service.command(input),
      f.service.command(input),
    ]);
    assert.equal(first.imageRejection, undefined);
    assert.equal(duplicate.id, first.id);
    assert.equal(f.db.list("run", { all: true }).length, 1);
    const timeline = await f.service.timeline("chat", undefined, first.id);
    assert.equal(timeline.runs[0].kernelConfig?.model, "vision");
    assert.equal(timeline.runs[0].admissionCommandId, input.commandId);
    assert.equal(timeline.messages[0].attachments?.length, 2);
    assert.equal("dataBase64" in timeline.messages[0].attachments![0], false);
    await assert.rejects(
      f.service.timeline(
        "other",
        undefined,
        first.id,
        input.type === "send" ? input.attachments![0].id : "",
      ),
      /不属于/,
    );
    await assert.rejects(f.service.timeline("chat", undefined, first.id, "unowned"), /不属于/);
    const observed = await f.service.timeline(
      "chat",
      undefined,
      undefined,
      undefined,
      input.commandId,
    );
    assert.deepEqual(observed.admission, { commandId: input.commandId, runId: first.id });
    assert.equal(
      (await f.service.timeline("other", undefined, undefined, undefined, input.commandId))
        .admission,
      undefined,
    );
    await f.restart();
    f.options({ models: [] }); // A replay observes accepted truth; it does not require a new model execution.
    assert.equal((await f.service.command(input)).id, first.id);
    const image = (
      await f.service.timeline("chat", undefined, first.id, timeline.messages[0].attachments![0].id)
    ).image?.input;
    assert.deepEqual(image, input.type === "send" ? input.attachments![0] : undefined);
    f.service.tick();
    for (let i = 0; i < 100 && !f.turns.length; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(f.turns.length, 1);
    assert.deepEqual(f.turns[0], input.type === "send" ? input.attachments : undefined);
    const different = { ...input, text: "changed" };
    assert.match((await f.service.command(different)).imageRejection!, /同一请求/);
  } finally {
    await f.cleanup();
  }
});

test("image-only admission, sync bypass denial, unsupported/unknown models and expired targets create no runs", async () => {
  const f = await fixture();
  try {
    assert.throws(
      () =>
        admitStudioCommand(
          f.db,
          { now: Date.now, id: randomUUID, delay: async () => {} },
          f.command(),
        ),
      /Host/,
    );
    for (const catalog of [
      { models: [] },
      { ...options, models: [{ ...options.models[0], inputModalities: undefined }] },
      {
        ...options,
        models: [{ ...options.models[0], inputModalities: ["text"] as const as ["text"] }],
      },
    ]) {
      f.options(catalog);
      assert.ok((await f.service.command(f.command())).imageRejection);
      assert.equal(f.db.list("run").length, 0);
    }
    f.options(options);
    const mismatch = {
      ...f.command(),
      selection: { model: "vision" },
      imageModel: "other",
    } as StudioCommand;
    assert.match((await f.service.command(mismatch)).imageRejection!, /不一致/);
    const sent = await f.service.command(f.command());
    assert.equal(sent.imageRejection, undefined);
    await f.service.command({ type: "cancel", commandId: randomUUID(), runId: sent.id });
    assert.equal((await f.service.timeline("chat")).runs[0].state, "cancelled");
    assert.equal(f.turns.length, 0);
    await f.service.command({
      type: "create-conversation",
      commandId: randomUUID(),
      id: "other",
      kernel: "claude-code",
      workspacePath: "/synthetic",
    });
    assert.match(
      (await f.service.command({ ...f.command(), targetId: "other" } as StudioCommand))
        .imageRejection!,
      /本地 Codex/,
    );
    let release!: (value: StudioKernelOptions) => void;
    f.inspect(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = f.service.command(f.command());
    await f.service.command({
      type: "delete",
      commandId: randomUUID(),
      kind: "conversation",
      id: "chat",
    });
    release(options);
    assert.match((await pending).imageRejection!, /会话/);
    assert.equal(f.db.list("run").length, 1);
  } finally {
    await f.cleanup();
  }
});

test("native Codex typed image input carries exact PNG/JPEG pixels; unknown/false/rerouted models never get turn/start", async () => {
  for (const modality of [["text", "image"], ["text"], undefined]) {
    const f = await setup({
      imageModalities: modality,
      imagePngPath: createRequire(import.meta.url).resolve("pngjs"),
      imageJpegPath: createRequire(import.meta.url).resolve("jpeg-js"),
    });
    try {
      const images = [syntheticImage(), syntheticImage("jpeg")];
      const result = await f.run("codex", { text: "", attachments: images });
      const wire = await f.readLines("wire.jsonl");
      const start = wire.find((message) => message.method === "turn/start");
      if (!modality?.includes("image")) {
        assert.equal(result.status, "failed");
        assert.equal(start, undefined);
      } else {
        assert.equal(result.status, "succeeded", result.error);
        assert.equal(start.params.input.length, 2);
        for (const [i, image] of images.entries()) {
          const value = start.params.input[i];
          assert.equal(value.type, "image");
          assert.equal(value.url, `data:${image.mimeType};base64,${image.dataBase64}`);
        }
        const proof = await f.readLines("image-proof.jsonl");
        assert.deepEqual(
          proof.map((p) => p.sha256),
          images.map((p) => p.sha256),
        );
        assert.deepEqual(
          proof.map((p) => [p.width, p.height]),
          [
            [2, 1],
            [2, 1],
          ],
        );
        assert.deepEqual(proof[0].pixels, [127, 11, 31, 255, 33, 77, 201, 255]);
      }
    } finally {
      await f.cleanup();
    }
  }
  const f = await setup({ imageModalities: ["image"], imageReroute: true });
  try {
    assert.equal((await f.run("codex", { attachments: [syntheticImage()] })).status, "failed");
    assert.equal(
      (await f.readLines("wire.jsonl")).some((m) => m.method === "turn/start"),
      false,
    );
  } finally {
    await f.cleanup();
  }
});
