// New verification harness; retained root Apache-2.0. No production dependency.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { z } from "zod";

if (!process.argv[2] || !process.argv[3]) {
  throw new Error(
    "Usage: node --import tsx protocol-wire-cross-version.mjs <old-module-directory> <new-module-directory>",
  );
}
const moduleRoot = (path) => pathToFileURL(`${resolve(path)}/`);
const baseline = moduleRoot(process.argv[2]);
const candidate = moduleRoot(process.argv[3]);
const oldCodec = await import(new URL("wire-codec.js", baseline).href);
const oldBatch = await import(new URL("wire-reassembly.js", baseline).href);
const newCodec = await import(new URL("wire-codec.js", candidate).href);
const newBatch = await import(new URL("wire-reassembly.js", candidate).href);
const frameSchema = z
  .object({ topic: z.string(), subscriptionId: z.string(), text: z.string() })
  .strict();
let roundtrips = 0;
for (const deliveryKind of ["initial", "online", "recovery"]) {
  for (const text of ["short", "中文🌍".repeat(12000), "\ud800\r\n".repeat(9000)]) {
    const frame = { topic: "conversation/fixture", subscriptionId: "synthetic", text };
    const options = {
      deliveryKind,
      topic: frame.topic,
      subscriptionId: frame.subscriptionId,
      logicalFrameId: "fixture",
      logicalFrameOrdinal: 42,
      maxPhysicalFrameBytes: 5000,
      measurePhysicalFrameBytes: (wire) =>
        oldCodec.measureTopicNotificationEnvelopeBytes(wire).maxBytes,
    };
    const oldWire = oldCodec.encodeTopicWireFrames(frame, options);
    const decoded = newBatch.reassembleTopicWireFrames(
      JSON.parse(JSON.stringify(oldWire)).toReversed(),
      frameSchema,
    );
    assert.deepEqual(decoded, { kind: "complete", frame, deliveryKind });
    const newWire = newCodec.encodeTopicWireFrames(decoded.frame, {
      ...options,
      measurePhysicalFrameBytes: (wire) =>
        newCodec.measureTopicNotificationEnvelopeBytes(wire).maxBytes,
    });
    assert.deepEqual(newWire, oldWire);
    assert.deepEqual(
      oldBatch.reassembleTopicWireFrames(JSON.parse(JSON.stringify(newWire)), frameSchema),
      decoded,
    );
    roundtrips++;
  }
}
function measureResult(codec, measure) {
  try {
    return codec.encodeTopicWireFrames(
      { topic: "t", subscriptionId: "s", text: "x".repeat(200) },
      {
        deliveryKind: "online",
        topic: "t",
        subscriptionId: "s",
        logicalFrameId: "i",
        logicalFrameOrdinal: 1,
        maxPhysicalFrameBytes: 99,
        measurePhysicalFrameBytes: measure,
      },
    );
  } catch (error) {
    return { name: error.name, message: error.message, reasonCode: error.reasonCode };
  }
}
let nonfiniteChecks = 0;
for (const value of [NaN, Infinity, -Infinity, undefined, 0, 99, 100]) {
  assert.deepEqual(
    measureResult(newCodec, () => value),
    measureResult(oldCodec, () => value),
  );
  nonfiniteChecks++;
}
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/protocol-v4/wire-binary.ts", import.meta.url))],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "wireHelpers",
  write: false,
});
const context = vm.createContext({ atob, btoa, TextEncoder, TextDecoder });
vm.runInContext(bundle.outputFiles[0].text, context);
assert.equal(vm.runInContext("typeof Buffer", context), "undefined");
assert.equal(vm.runInContext("typeof process", context), "undefined");
const bytes = Uint8Array.from({ length: 65537 }, (_, i) => (i * 47) & 255);
const helpers = context.wireHelpers;
assert.equal(helpers.encodeWireBytesBase64(bytes), Buffer.from(bytes).toString("base64"));
assert.deepEqual([...helpers.decodeWireBase64(Buffer.from(bytes).toString("base64"))], [...bytes]);
assert.equal(helpers.crc32WireBytes(new TextEncoder().encode("123456789")), "cbf43926");
assert.deepEqual([...helpers.decodeWireBase64("Zh==")], [102]);
console.log(
  JSON.stringify({
    oldNewOldRoundtrips: roundtrips,
    nonfiniteMeasurementChecks: nonfiniteChecks,
    browserVm: { bundled: true, nodeGlobalsAbsent: true, bytes: bytes.length, checks: 4 },
    actualBrowser: false,
  }),
);
