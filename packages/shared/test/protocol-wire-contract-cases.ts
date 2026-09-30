// New contract fixtures; root Apache-2.0 retained. Old-source exposure is disclosed
// in specs/knorvia-protocol-wire-helpers-20260930.md; no MIT/clean-room claim.
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { z } from "zod";
import { PROTOCOL_V4_LIMITS } from "../src/protocol-v4/core.js";
import type * as Binary from "../src/protocol-v4/wire-binary.js";
import type * as Codec from "../src/protocol-v4/wire-codec.js";
import type * as Reassembly from "../src/protocol-v4/wire-reassembly.js";
import type { TopicWireFrame } from "../src/protocol-v4/wire.js";

export async function loadWireHelpers() {
  const root = new URL(
    `../${process.env.KNORVIA_WIRE_TEST_TARGET ?? "src"}/protocol-v4/`,
    import.meta.url,
  );
  const [binary, codec, reassembly] = await Promise.all([
    import(new URL("wire-binary.js", root).href) as Promise<typeof Binary>,
    import(new URL("wire-codec.js", root).href) as Promise<typeof Codec>,
    import(new URL("wire-reassembly.js", root).href) as Promise<typeof Reassembly>,
  ]);
  return { ...binary, ...codec, ...reassembly };
}
export type WireHelpers = Awaited<ReturnType<typeof loadWireHelpers>>;

export const payloadSchema = z
  .object({
    topic: z.string(),
    subscriptionId: z.string(),
    text: z.string(),
  })
  .strict();
export const payload = {
  topic: "conversation/fixture",
  subscriptionId: "subscription-fixture",
  text: "你好🌍",
};
export const identity = {
  wireVersion: 3 as const,
  deliveryKind: "online" as const,
  logicalFrameId: "logical-fixture",
  logicalFrameOrdinal: 7,
  topic: payload.topic,
  subscriptionId: payload.subscriptionId,
};
export const complete: Extract<TopicWireFrame<unknown>, { kind: "complete" }> = {
  ...identity,
  kind: "complete",
  frame: payload,
};
type Fragment = Extract<TopicWireFrame<unknown>, { kind: "fragment" }>;

export function fixtureFragments(
  bytes = Buffer.from(JSON.stringify(payload)),
  split = 17,
): Fragment[] {
  const parts: Fragment[] = [];
  const checksum = {
    algorithm: "crc32" as const,
    value: crc32(bytes).toString(16).padStart(8, "0"),
  };
  for (let start = 0; start < bytes.length; start += split) {
    parts.push({
      ...identity,
      kind: "fragment",
      fragmentIndex: parts.length,
      fragmentCount: Math.ceil(bytes.length / split),
      logicalBytes: bytes.length,
      checksum,
      dataBase64: bytes.subarray(start, start + split).toString("base64"),
    });
  }
  return parts;
}

export function jsonObservation(run: () => unknown): unknown {
  let value: unknown;
  try {
    value = run();
  } catch (error) {
    const fault = error as Error & { reasonCode?: string };
    value = {
      thrown: {
        name: fault.name,
        message: fault.message,
        ...("reasonCode" in fault ? { reasonCode: fault.reasonCode } : {}),
      },
    };
  }
  return JSON.parse(JSON.stringify(value ?? null));
}

interface ContractCase {
  name: string;
  run(api: WireHelpers): unknown;
}
export function wireContractCases(): ContractCase[] {
  const cases: ContractCase[] = [];
  const add = (name: string, run: ContractCase["run"]) => cases.push({ name, run });
  for (const length of [
    0, 1, 2, 3, 4, 5, 127, 128, 255, 256, 12287, 12288, 12289, 16384, 32769, 65537,
  ]) {
    add(`binary/length-${length}`, (api) => {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 251) & 255);
      const base64 = api.encodeWireBytesBase64(bytes);
      const decoded = api.decodeWireBase64(base64);
      return {
        crc: api.crc32WireBytes(bytes),
        encodedLength: base64.length,
        encodedSha256: createHash("sha256").update(base64).digest("hex"),
        decodedSha256: decoded ? createHash("sha256").update(decoded).digest("hex") : null,
      };
    });
  }
  for (const value of [
    "",
    "Zg==",
    "Zm8=",
    "Zm9v",
    "Zh==",
    "Zm9=",
    "AA==",
    "/w==",
    "____",
    "Zg",
    "Zg=",
    "=Zg=",
    "Zg===",
    "Zg==\n",
    " Zg==",
    "A===",
    "AAAA====",
    "AAAAAA==",
    "éééé",
  ]) {
    add(`base64/${JSON.stringify(value)}`, (api) => ({
      valid: api.topicWireBase64Schema.safeParse(value).success,
      decoded: api.decodeWireBase64(value) ? [...api.decodeWireBase64(value)!] : null,
    }));
  }
  for (const [name, value] of Object.entries({
    unicode: payload,
    loneSurrogate: "\ud800",
    undef: undefined,
    nan: NaN,
    infinity: Infinity,
    omitted: { a: undefined, b: 1 },
    toJSON: { toJSON: () => "custom" },
    bigint: 1n,
  })) {
    add(`json/${name}`, (api) => api.utf8JsonByteLength(value));
  }
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  add("json/cyclic", (api) => api.utf8JsonByteLength(cyclic));
  for (const size of [0, 1, 20, 127, 128, 16370, 16384]) {
    add(`envelope/size-${size}`, (api) =>
      api.measureTopicNotificationEnvelopeBytes({
        ...complete,
        frame: { ...payload, text: "x".repeat(size) },
      }),
    );
  }
  for (const deliveryKind of ["initial", "online", "recovery"] as const) {
    for (const budget of [0.5, 1, 380, 500, 1200, PROTOCOL_V4_LIMITS.maxFrameBytes * 2]) {
      add(`encode/${deliveryKind}/${budget}`, (api) => {
        const calls: unknown[] = [];
        const frames = api.encodeTopicWireFrames(
          { ...payload, text: "文🌍".repeat(70) },
          {
            ...identity,
            deliveryKind,
            maxPhysicalFrameBytes: budget,
            measurePhysicalFrameBytes: (wire) => {
              calls.push(
                wire.kind === "complete"
                  ? "complete"
                  : [wire.fragmentIndex, wire.fragmentCount, wire.dataBase64.length],
              );
              return api.utf8JsonByteLength(wire);
            },
          },
        );
        return { frames, calls };
      });
    }
  }
  for (const field of ["maxPhysicalFrameBytes", "maxAssemblyBytes"] as const) {
    for (const value of [0, -1, NaN, Infinity, -Infinity, 0.5, 1.9, null, undefined]) {
      add(`limit/${field}/${String(value)}`, (api) =>
        api.encodeTopicWireFrames(payload, {
          ...identity,
          [field]: value,
          measurePhysicalFrameBytes: () => 0,
        }),
      );
    }
  }
  add("encode/assembly-before-measure", (api) =>
    api.encodeTopicWireFrames(payload, {
      ...identity,
      maxAssemblyBytes: 1,
      measurePhysicalFrameBytes: () => {
        throw new Error("measurement must not happen");
      },
    }),
  );
  add("encode/measurement-native-error", (api) =>
    api.encodeTopicWireFrames(payload, {
      ...identity,
      measurePhysicalFrameBytes: () => {
        throw new RangeError("fixture measure error");
      },
    }),
  );
  add("encode/fragment-count", (api) =>
    api.encodeTopicWireFrames(
      { ...payload, text: "x".repeat(5000) },
      {
        ...identity,
        maxPhysicalFrameBytes: 100,
        measurePhysicalFrameBytes: (wire) =>
          wire.kind === "complete" ? 101 : wire.dataBase64.length > 4 ? 101 : 100,
      },
    ),
  );
  add("encode/remeasure-overflow", (api) =>
    api.encodeTopicWireFrames(payload, {
      ...identity,
      maxPhysicalFrameBytes: 100,
      measurePhysicalFrameBytes: (wire) =>
        wire.kind === "complete" || (wire.kind === "fragment" && wire.fragmentCount < 100)
          ? 101
          : 0,
    }),
  );
  add("encode/undefined-empty", (api) =>
    api.encodeTopicWireFrames(undefined, { ...identity, measurePhysicalFrameBytes: () => 0 }),
  );

  const fragments = fixtureFragments();
  const assemble = (api: WireHelpers, wires: readonly TopicWireFrame<unknown>[], options = {}) =>
    api.reassembleTopicWireFrames(wires, payloadSchema, options);
  add("assemble/empty-precedes-limit", (api) => assemble(api, [], { maxAssemblyBytes: NaN }));
  add("assemble/complete", (api) => assemble(api, [complete]));
  add("assemble/complete-duplicate", (api) => assemble(api, [complete, complete]));
  add("assemble/complete-route", (api) => assemble(api, [{ ...complete, topic: "other" }]));
  add("assemble/complete-payload", (api) =>
    assemble(api, [{ ...complete, frame: { ...payload, text: 3 } }]),
  );
  add("assemble/complete-length", (api) => assemble(api, [complete], { maxAssemblyBytes: 1 }));
  add("assemble/complete-null", (api) => assemble(api, [{ ...complete, frame: null }]));
  for (const value of [0, -1, Infinity, NaN, 0.5, null]) {
    add(`assemble/limit-${String(value)}`, (api) =>
      assemble(api, [complete], { maxAssemblyBytes: value }),
    );
  }
  add("assemble/fragments", (api) => assemble(api, fragments));
  add("assemble/shuffled-duplicates", (api) =>
    assemble(api, [fragments[2]!, ...fragments.toReversed(), fragments[0]!]),
  );
  add("assemble/missing", (api) => assemble(api, [fragments[3]!, fragments[0]!]));
  add("assemble/over-count", (api) =>
    assemble(api, [{ ...fragments[0]!, fragmentCount: 1025, logicalBytes: 1025 }]),
  );
  add("assemble/advertised-over-limit", (api) =>
    assemble(api, [{ ...fragments[0]!, logicalBytes: 1000 }], { maxAssemblyBytes: 500 }),
  );
  for (const [field, value] of Object.entries({
    logicalFrameId: "other",
    logicalFrameOrdinal: 8,
    deliveryKind: "recovery",
    topic: "other",
    subscriptionId: "other",
    fragmentCount: 2,
    logicalBytes: 999,
    fragmentIndex: -1,
  })) {
    add(`assemble/metadata-${field}`, (api) =>
      assemble(api, [fragments[0]!, { ...fragments[1]!, [field]: value }]),
    );
  }
  add("assemble/index-upper", (api) =>
    assemble(api, [{ ...fragments[0]!, fragmentIndex: fragments.length }]),
  );
  add("assemble/count-over-bytes", (api) => assemble(api, [{ ...fragments[0]!, logicalBytes: 1 }]));
  add("assemble/checksum-metadata", (api) =>
    assemble(api, [
      fragments[0]!,
      { ...fragments[1]!, checksum: { algorithm: "crc32", value: "00000000" } },
    ]),
  );
  add("assemble/mixed-kinds", (api) => assemble(api, [fragments[0]!, complete]));
  add("assemble/invalid-base64", (api) => assemble(api, [{ ...fragments[0]!, dataBase64: "bad" }]));
  add("assemble/duplicate-conflict", (api) =>
    assemble(api, [fragments[0]!, { ...fragments[0]!, dataBase64: "eHh4" }]),
  );
  add("assemble/cumulative-over-limit", (api) =>
    assemble(
      api,
      [{ ...fragments[0]!, logicalBytes: 50, dataBase64: Buffer.alloc(51).toString("base64") }],
      { maxAssemblyBytes: 50 },
    ),
  );
  add("assemble/cumulative-over-length", (api) =>
    assemble(api, [
      { ...fragments[0]!, logicalBytes: 50, dataBase64: Buffer.alloc(51).toString("base64") },
    ]),
  );
  add("assemble/final-length", (api) =>
    assemble(
      api,
      fragments.map((f) => ({ ...f, logicalBytes: f.logicalBytes + 1 })),
    ),
  );
  add("assemble/checksum", (api) =>
    assemble(
      api,
      fragments.map((f) => ({ ...f, checksum: { algorithm: "crc32", value: "00000000" } })),
    ),
  );
  add("assemble/utf8", (api) => assemble(api, fixtureFragments(Buffer.from([0xc0, 0xaf]))));
  add("assemble/json", (api) => assemble(api, fixtureFragments(Buffer.from("not json"))));
  add("assemble/inner-route", (api) =>
    assemble(api, fixtureFragments(Buffer.from(JSON.stringify({ ...payload, topic: "other" })))),
  );
  add("assemble/inner-null", (api) => assemble(api, fixtureFragments(Buffer.from("null"))));
  add("assemble/inner-schema", (api) =>
    assemble(api, fixtureFragments(Buffer.from(JSON.stringify({ ...payload, text: 42 })))),
  );
  add("assemble/base64-precedes-later-metadata", (api) =>
    assemble(api, [
      { ...fragments[0]!, dataBase64: "bad" },
      { ...fragments[1]!, topic: "other" },
    ]),
  );
  add("assemble/missing-precedes-checksum", (api) =>
    assemble(api, [{ ...fragments[0]!, checksum: { algorithm: "crc32", value: "00000000" } }]),
  );
  add("assemble/native-schema-error", (api) =>
    api.reassembleTopicWireFrames(
      [complete],
      z.unknown().transform(() => {
        throw new Error("fixture schema error");
      }),
    ),
  );
  return cases;
}
