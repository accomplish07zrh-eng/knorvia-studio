// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { searchWorld } from "./search-cases.mjs";
import { path } from "./fixture.mjs";
const loaded = await target();
after(() => loaded.dispose());
test("nested Worker/timer hooks restore their owner and settle once", async () => {
  const w = searchWorld(),
    delays = [],
    selected = [];
  const timer = w.setTimeout;
  w.setTimeout = (callback, delay) => {
    delays.push(delay);
    return timer(callback, delay);
  };
  const { fs } = loaded.use(w);
  const install = (name) =>
    fs.setRipgrepWorkerFactoryForTests((data) => {
      selected.push(name);
      const worker = w.worker(data);
      queueMicrotask(() => {
        worker.emit("message", { type: "result", result: { code: 1, stdout: "", stderr: "" } });
        worker.emit("error", new Error("late synthetic error"));
        worker.emit("exit", 9);
      });
      return worker;
    });
  const outerFactory = install("outer"),
    outerBudget = fs.setRipgrepTimeoutMsForTests(77);
  try {
    const options = { textSearchEngine: "javascript" },
      port = new fs.NodeFileSystemAdapter(options);
    await port.searchText({ path: path("tree"), pattern: "target" });
    assert.deepEqual(selected, []);
    options.textSearchEngine = "ripgrep";
    await port.searchText({ path: path("tree"), pattern: "target" });
    const innerFactory = install("inner"),
      innerBudget = fs.setRipgrepTimeoutMsForTests(11);
    try {
      await port.searchText({ path: path("tree"), pattern: "target" });
    } finally {
      innerBudget();
      innerFactory();
    }
    await port.searchText({ path: path("tree"), pattern: "target" });
    assert.deepEqual(selected, ["outer", "inner", "outer"]);
    assert.deepEqual(delays, [77, 11, 77]);
    assert.deepEqual(w.workerEvents, []);
    assert.equal(w.scheduled.length, 0);
  } finally {
    outerBudget();
    outerFactory();
  }
});
