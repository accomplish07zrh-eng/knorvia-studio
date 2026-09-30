// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { subject } from "./subject.mjs";

const { DefaultLogRedactor } = await subject("serialize");
const length = 250_000;
const shared = { value: "fixture" };
const input = new Array(length);
let baseline;
let extraHeap;
Object.defineProperty(input, 0, {
  get() {
    extraHeap = process.memoryUsage().heapUsed - baseline;
    return shared;
  },
});
input[length - 1] = shared;
const redactor = new DefaultLogRedactor();
redactor.redact([]);
globalThis.gc();
baseline = process.memoryUsage().heapUsed;
const output = redactor.redact(input);
process.stdout.write(
  JSON.stringify({
    extraHeap,
    length: output.length,
    first: output[0],
    last: output[length - 1],
    keys: Object.keys(output),
    middlePresent: 1 in output,
  }),
);
