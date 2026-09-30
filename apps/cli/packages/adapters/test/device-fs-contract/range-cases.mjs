// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { info, portable, world } from "./fixture.mjs";
const FAST_MAX = 10 * 1024 * 1024;
const inputs = [
  "",
  "61",
  "610a",
  "610d",
  "610d0a620a",
  "610d0a620d0a63",
  "efbbbf610a",
  "fffe61000a0062000a00",
  "c4e3bac30a61",
  "00",
  "f09f98800a",
];
export const rangeInputs = [
  ...inputs.flatMap((hex) => [false, true].map((stream) => ({ hex, stream }))),
  ...[undefined, "utf8", "utf16le", "hex", "base64", "gbk"].flatMap((encoding) =>
    [false, true].map((stream) => ({ hex: "610d0a620d0a63", encoding, stream })),
  ),
  ...[-2, 0, 1, 1.8, 5, NaN, Infinity].flatMap((offsetLine) =>
    [false, true].map((stream) => ({ hex: "610d0a620a", offsetLine, limitLines: 1, stream })),
  ),
  ...[-2, 0, 1, 1.8, 5, NaN, Infinity].flatMap((limitLines) =>
    [false, true].map((stream) => ({ hex: "610d0a620a", offsetLine: 1, limitLines, stream })),
  ),
  ...[false, true].flatMap((stream) => [
    { hex: "61", stream, aborted: true },
    { hex: "61", stream, maxBytes: -1 },
    { hex: "61", stream, maxBytes: FAST_MAX },
    { hex: "61", stream, readError: true },
  ]),
  { hex: "e4bda0e5a5bd0d0a620d0a", stream: true, byteChunks: true },
  { hex: "610d0a620d0a", stream: true, headCloseError: true },
  { hex: "610a62", stream: true, abortOnStream: true },
];

export async function observeRange(subject, input) {
  const w = world();
  const p = w.put("range.txt", Buffer.from(input.hex, "hex"));
  if (input.byteChunks)
    w.chunks = [...Buffer.from(input.hex, "hex")].map((byte) => Buffer.from([byte]));
  else
    w.chunks = [
      Buffer.from(input.hex, "hex").subarray(0, 2),
      Buffer.from(input.hex, "hex").subarray(2),
    ];
  const controller = new AbortController();
  if (input.aborted) controller.abort();
  const read = w.readFile;
  if (input.readError)
    w.readFile = async (...args) => {
      await read(...args);
      throw new Error("Controlled range read failure");
    };
  const open = w.open;
  if (input.headCloseError)
    w.open = async (...args) => {
      const h = await open(...args);
      h.close = async () => {
        w.events.push(["close", args[0]]);
        throw new Error("Controlled head close failure");
      };
      return h;
    };
  const stream = w.createReadStream;
  if (input.abortOnStream)
    w.createReadStream = (...args) => {
      const s = stream(...args);
      queueMicrotask(() => controller.abort());
      return s;
    };
  subject.use(w);
  try {
    const value = await subject.subject.range.readTextFileRangeFromNode(
      { ...input, path: p },
      info("file", input.stream ? FAST_MAX + 1 : FAST_MAX),
      controller.signal,
    );
    return { value: portable(value), events: portable(w.events) };
  } catch (error) {
    return { error: portable(error), events: portable(w.events) };
  }
}
