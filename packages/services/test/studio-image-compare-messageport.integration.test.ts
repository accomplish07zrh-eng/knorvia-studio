// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageChannel } from "node:worker_threads";
import { createHash, randomUUID } from "node:crypto";
import { crc32 } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import {
  ChannelClient,
  ChannelServer,
  MessagePortProtocol,
  ProxyChannel,
  Event,
} from "@knorvia/rpc";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { independentImages } from "./fixtures/studio-independent-images.integration.js";
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function paddedPng(original: Buffer, size: number) {
  const padding = Buffer.alloc(size - original.length);
  padding.writeUInt32BE(padding.length - 12);
  padding.write("npAD", 4, "ascii");
  padding.writeUInt32BE(crc32(padding.subarray(4, -4)), padding.length - 4);
  return Buffer.concat([original.subarray(0, 33), padding, original.subarray(33)]);
}
test(
  "largest legitimate isolated PNG pair crosses real MessagePort binary RPC without truncation",
  { timeout: 120000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "knorvia-compare-pair-budget-"));
    let owner: any;
    let client: any;
    let server: any;
    let left: any;
    let right: any;
    try {
      const images = await independentImages();
      const before = paddedPng(
        Buffer.from(images.baselinePng!.dataBase64, "base64"),
        16 * 1024 * 1024,
      );
      const after = paddedPng(
        Buffer.from(images.workingPng!.dataBase64, "base64"),
        25 * 1024 * 1024,
      );
      const source = join(root, "source");
      await mkdir(source);
      await writeFile(join(source, "bounded.png"), before);
      const workspaces = createStudioWorkspaceManager(join(root, "snapshots"));
      const working = await workspaces.prepare({
        runId: "physical-run",
        stepId: "physical-step",
        sourcePath: source,
        mode: "isolated",
      });
      await writeFile(join(working, "bounded.png"), after);
      const db = new StudioDatabase(join(root, "studio.sqlite"));
      db.transaction(() => {
        db.write(
          "run",
          "review-run",
          {
            id: "review-run",
            targetId: "group",
            kind: "group",
            state: "succeeded",
            attempt: 1,
            input: "Synthetic budget only",
            checkpoint: { steps: {}, values: {}, completedRounds: 0 },
            createdAt: 1,
            updatedAt: 1,
          },
          "group",
        );
        db.write(
          "workspace",
          "review-run:review-step",
          { runId: "physical-run", stepId: "physical-step", sourcePath: source, path: working },
          "review-run",
        );
      });
      owner = new StudioRuntimeService({
        db,
        workspaces,
        clock: {
          now: Date.now,
          id: randomUUID,
          delay: (ms, signal) => delay(ms, undefined, { signal }),
        },
        kernels: {
          adapter: () => ({
            run: async () => {
              throw new Error("Readonly budget check cannot call model");
            },
          }),
          inspect: async () => [],
          manage: async () => {
            throw new Error("unused");
          },
          dispose: async () => {},
        },
        onDidChange: Event.None,
        notify: () => {},
      });
      const ports = new MessageChannel();
      left = new MessagePortProtocol(ports.port1);
      right = new MessagePortProtocol(ports.port2);
      let maxServerFrameBytes = 0;
      client = new ChannelClient(left);
      server = new ChannelServer(
        {
          onMessage: right.onMessage,
          send: (frame: any) => {
            maxServerFrameBytes = Math.max(maxServerFrameBytes, frame.byteLength);
            right.send(frame);
          },
        },
        "actual-node-message-port",
        1000,
        true,
      );
      server.registerChannel("studio-runtime", ProxyChannel.fromService(owner));
      server.ready();
      const service = ProxyChannel.toService(client.getChannel("studio-runtime")) as any;
      const version = {
        beforeHash: hash(before),
        afterHash: hash(after),
        sourceHash: hash(before),
      };
      const result = (
        await service.workspaceChanges({
          runId: "review-run",
          stepId: "review-step",
          imagePreview: { path: "bounded.png", version },
        })
      )[0];
      assert.deepEqual(result.imagePreview.version, version);
      for (const [side, expected] of [
        ["before", before],
        ["after", after],
      ] as const) {
        const actual = result.imagePreview[side];
        assert.equal(actual.kind, "image");
        assert.equal(actual.totalBytes, expected.length);
        const decoded = Buffer.from(actual.dataBase64, "base64");
        assert.equal(decoded.length, expected.length);
        assert.equal(hash(decoded), hash(expected));
      }
      assert.ok(maxServerFrameBytes > 50 * 1024 * 1024);
      assert.deepEqual(await readFile(join(source, "bounded.png")), before);
      process.stdout.write(
        JSON.stringify({
          beforeBytes: before.length,
          afterBytes: after.length,
          maxServerFrameBytes,
          transport: "MessagePortProtocol/ChannelClient/ChannelServer",
        }) + "\n",
      );
    } finally {
      client?.dispose();
      server?.dispose();
      left?.disconnect();
      right?.disconnect();
      await owner?.disposeAllAndWait();
      await rm(root, { recursive: true, force: true });
    }
  },
);
