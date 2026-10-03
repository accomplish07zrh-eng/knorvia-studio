// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import * as fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Worker } from "node:worker_threads";
import { world } from "./fixture.mjs";
export function nativeWorld(directory, messages = []) {
  const w = world();
  w.home = directory;
  w.process.env = {};
  w.process.pid = process.pid;
  for (const key of [
    "mkdir",
    "open",
    "readFile",
    "rename",
    "stat",
    "lstat",
    "unlink",
    "writeFile",
    "readdir",
  ])
    w[key] = fs[key];
  w.createReadStream = createReadStream;
  w.setTimeout = setTimeout;
  w.clearTimeout = clearTimeout;
  w.worker = (program, options) => {
    const worker = new Worker(program, options);
    worker.on("message", (message) => messages.push(message));
    return worker;
  };
  return w;
}
