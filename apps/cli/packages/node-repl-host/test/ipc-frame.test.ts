// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { getEventListeners, once } from "node:events";
import { Socket } from "node:net";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { readFrame } from "../src/ipc.js";
import { observe } from "./ipc-test-support.js";

test("JSON frame values survive every UTF-8 split, CRLF, and invalid byte replacement", async () => {
  for (const value of [
    null,
    true,
    42,
    "中文 🌿",
    ["界", 1],
    { title: "示例", nested: { ok: false } },
  ]) {
    const bytes = Buffer.from(JSON.stringify(value) + "\r\n");
    for (let offset = 0; offset <= bytes.length; offset += 1) {
      const socket = new Socket();
      const read = readFrame(socket, bytes.length, new AbortController().signal);
      socket.emit("data", bytes.subarray(0, offset));
      socket.emit("data", bytes.subarray(offset));
      assert.deepEqual(await read, value);
      socket.destroy();
    }
  }
  const socket = new Socket();
  const read = readFrame(socket, 64, new AbortController().signal);
  socket.emit("data", Buffer.from([34, 0xc3]));
  socket.emit("data", Buffer.from([0x28, 34, 10]));
  assert.equal(await read, "�(");
  socket.destroy();
});

test("the frame bound includes LF and applies while a line is incomplete", async () => {
  for (const chunks of [["12", "3\n"], ["12345"], ["1", "2", "3", "4", "5"]]) {
    const socket = new Socket();
    const result = readFrame(socket, 3, new AbortController().signal);
    const rejected = assert.rejects(result, /Broker frame exceeded 3 bytes/);
    for (const chunk of chunks) socket.emit("data", Buffer.from(chunk));
    await rejected;
    assert.equal(socket.destroyed, false, "the reader must not own socket disposal");
    socket.destroy();
  }
  const socket = new Socket();
  const result = readFrame(socket, 4, new AbortController().signal);
  socket.emit("data", Buffer.from("123\n"));
  assert.equal(await result, 123);
  socket.destroy();
});

test("each terminal path removes only its own listeners and keeps the writer usable", async () => {
  for (const event of ["value", "invalid", "close", "error", "abort"] as const) {
    const socket = new Socket();
    const controller = new AbortController();
    const sentinel = () => {};
    for (const name of ["data", "error", "close", "end"]) socket.on(name, sentinel);
    const listeners = new Map(
      ["data", "error", "close", "end"].map((name) => [name, socket.listeners(name)]),
    );
    controller.signal.addEventListener("abort", sentinel);
    const result = observe(readFrame(socket, 64, controller.signal));
    if (event === "value" || event === "invalid") {
      socket.emit("data", Buffer.from(event === "value" ? "{}\n" : "invalid\n"));
    } else if (event === "abort") controller.abort(new Error("cancel fixture"));
    else socket.emit(event, new Error("connection fixture"));
    await result.settled;
    for (const name of ["data", "error", "close", "end"]) {
      assert.deepEqual(socket.listeners(name), listeners.get(name), name);
    }
    assert.deepEqual(getEventListeners(controller.signal, "abort"), [sentinel]);
    assert.equal(socket.destroyed, false);
    socket.destroy();
  }
});

test("network errors and explicit abort reasons preserve their identity", async () => {
  for (const reason of [new Error("offline cancellation"), "caller cancelled", null]) {
    const socket = new Socket();
    const controller = new AbortController();
    const result = observe(readFrame(socket, 64, controller.signal));
    controller.abort(reason);
    await result.settled;
    const state = result.current();
    assert.equal(state.status, "error");
    if (state.status === "error") {
      if (reason === null) assert.equal((state.error as Error).name, "AbortError");
      else assert.equal(state.error, reason);
    }
    socket.destroy();
  }
  const socket = new Socket();
  const result = observe(readFrame(socket, 64, new AbortController().signal));
  const failure = new Error("offline network fixture");
  socket.emit("error", failure);
  await result.settled;
  assert.deepEqual(result.current(), { status: "error", error: failure });
  socket.destroy();
});

test("a pre-aborted reader attaches no listeners and rejects immediately", async () => {
  const socket = new Socket();
  const listeners = new Map(
    ["data", "error", "close", "end"].map((name) => [name, socket.listeners(name)]),
  );
  const reason = new Error("already cancelled");
  await assert.rejects(
    readFrame(socket, 64, AbortSignal.abort(reason)),
    (error) => error === reason,
  );
  for (const name of ["data", "error", "close", "end"])
    assert.deepEqual(socket.listeners(name), listeners.get(name));
  socket.destroy();
});

test("only the first frame counts toward the cap when extra bytes share its chunk", async () => {
  const socket = new Socket();
  try {
    const result = readFrame(socket, 3, new AbortController().signal);
    socket.emit("data", Buffer.from("{}\n" + "unrelated trailing bytes"));
    assert.deepEqual(await result, {});
  } finally {
    socket.destroy();
  }
});

test("malformed JSON never quotes frame contents and UTF-8 BOM is not silently stripped", async () => {
  for (const body of [
    "private-fixture\n",
    '{"token":"private-fixture""broken"}\n',
    "\ufeff{}\n",
    "\n",
  ]) {
    const socket = new Socket();
    try {
      const result = readFrame(socket, 256, new AbortController().signal);
      socket.emit("data", Buffer.from(body));
      await assert.rejects(result, (error) => {
        assert.ok(error instanceof SyntaxError);
        assert.equal(error.message, "Broker returned invalid JSON");
        assert.ok(!String(error.stack).includes("private-fixture"));
        assert.equal(error.cause, undefined);
        return true;
      });
    } finally {
      socket.destroy();
    }
  }
});

test("EOF and sockets already closed do not wait for a future close event", async () => {
  for (const alreadyClosed of [false, true]) {
    const socket = new Socket();
    if (alreadyClosed) {
      const closed = once(socket, "close");
      socket.destroy();
      await closed;
    }
    const controller = new AbortController();
    const result = observe(readFrame(socket, 64, controller.signal));
    if (!alreadyClosed) {
      socket.emit("data", Buffer.from('{"partial":'));
      socket.emit("end");
    }
    await setImmediate();
    const state = result.current();
    controller.abort();
    await result.settled;
    socket.destroy();
    assert.equal(state.status, "error", "an ended input must settle without a new close event");
    if (state.status === "error") assert.match(String(state.error), /closed before returning/);
  }
});

test("another abort observer cannot prevent frame cancellation", async () => {
  const socket = new Socket();
  const controller = new AbortController();
  controller.signal.addEventListener("abort", (event) => event.stopImmediatePropagation());
  const result = observe(readFrame(socket, 64, controller.signal));
  const reason = new Error("protected cancellation");
  controller.abort(reason);
  await setImmediate();
  const state = result.current();
  socket.emit("close");
  await result.settled;
  socket.destroy();
  assert.deepEqual(state, { status: "error", error: reason });
});
