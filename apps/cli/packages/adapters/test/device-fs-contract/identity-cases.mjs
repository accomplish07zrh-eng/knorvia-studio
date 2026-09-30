// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { world, info, ioError, portable, path, flush, portableIoEvents } from "./fixture.mjs";
export const identityInputs = [
  ...[
    '{"deviceMid":"existing","extra":{"keep":true}}',
    '{"deviceMid":"  "}',
    "{}",
    "[]",
    "null",
    "false",
    "broken",
    '{"deviceMid":0,"unknown":[1,2]}',
    '{"deviceMid":""}',
  ].map((state) => ({ state })),
  { missing: true },
  { state: '{"extra":"keep"}', rereadWinner: true },
  ...["default", "env", "empty", "tilde", "tilde-child", "relative", "backslash-tilde"].map(
    (base) => ({ base }),
  ),
  ...["dead", "invalid", "alive", "eperm", "malformed", "no-owner", "stale", "near-stale"].map(
    (lock) => ({ lock }),
  ),
  { openFails: true },
  { tempWriteFails: true },
  { renameFails: true },
  { closeFails: true },
  { generatorThrows: true },
  { id: "" },
  { id: "  " },
];
export async function observeIdentity(loaded, input, index) {
  const w = world();
  w.home = path("identity-home-" + index);
  const configured = path("identity-base-" + index);
  w.process.env.KNORVIA_DATA_BASE_DIR = configured;
  const options = { baseDir: configured };
  switch (input.base) {
    case "default":
      delete options.baseDir;
      w.process.env = {};
      break;
    case "env":
      delete options.baseDir;
      options.env = { KNORVIA_DATA_BASE_DIR: "  " + configured + "  " };
      break;
    case "empty":
      options.baseDir = "";
      break;
    case "tilde":
      options.baseDir = "~";
      break;
    case "tilde-child":
      options.baseDir = "~/child";
      break;
    case "relative":
      options.baseDir = "identity-relative-" + index;
      break;
    case "backslash-tilde":
      options.baseDir = "~\\identity-child-" + index;
      break;
  }
  const selected =
    options.baseDir ??
    options.env?.KNORVIA_DATA_BASE_DIR?.trim() ??
    w.process.env.KNORVIA_DATA_BASE_DIR?.trim() ??
    w.home;
  const raw = selected.length ? selected : w.home;
  const base =
    raw === "~"
      ? w.home
      : raw.startsWith("~/")
        ? w.paths.join(w.home, raw.slice(2))
        : w.paths.resolve(raw);
  const stateFile = w.paths.join(base, ".knorvia-studio", "v2", "telemetry-state.json");
  const lockFile = w.paths.join(w.paths.dirname(stateFile), "telemetry-state.lock");
  const set = (p, text, mtime = w.now) => {
    w.files.set(p, Buffer.from(text));
    w.metadata.set(p, info("file", Buffer.byteLength(text), mtime));
  };
  if (!input.missing) set(stateFile, input.state ?? "{}");
  let generations = 0;
  options.createId = () => {
    generations++;
    if (input.generatorThrows) throw new Error("Controlled ID generation failure");
    return input.id ?? "created-controlled";
  };
  if (input.lock) {
    let owner = { pid: 999, createdAt: w.now };
    if (input.lock === "invalid") owner.pid = -1;
    const text =
      input.lock === "malformed"
        ? "broken"
        : input.lock === "no-owner"
          ? "{}"
          : JSON.stringify(owner);
    set(
      lockFile,
      text,
      input.lock === "stale"
        ? w.now - 300000
        : input.lock === "near-stale"
          ? w.now - 299999
          : w.now,
    );
    if (["alive", "near-stale", "stale"].includes(input.lock))
      w.process.kill = (pid, signal) => {
        w.events.push(["kill", pid, signal]);
      };
    if (input.lock === "eperm")
      w.process.kill = (pid, signal) => {
        w.events.push(["kill", pid, signal]);
        throw ioError("EPERM");
      };
  }
  const open = w.open;
  w.open = async (p, flags) => {
    if (input.openFails) {
      w.events.push(["open", p, flags]);
      throw ioError("EACCES");
    }
    const handle = await open(p, flags);
    if (input.rereadWinner && p === lockFile)
      set(stateFile, '{"deviceMid":"winner","extra":"kept"}');
    if (input.closeFails)
      handle.close = async () => {
        w.events.push(["close", p]);
        throw ioError("EIO");
      };
    return handle;
  };
  if (input.tempWriteFails) {
    const write = w.writeFile;
    w.writeFile = async (...a) => {
      await write(...a);
      throw ioError("EIO");
    };
  }
  if (input.renameFails)
    w.rename = async (...a) => {
      w.events.push(["rename", ...a]);
      throw ioError("EPERM");
    };
  const subject = loaded.use(w).identity;
  let done = false,
    result;
  const first = subject.ensureCliDeviceMid(options);
  const samePromise =
    first ===
    subject.ensureCliDeviceMid({
      ...options,
      createId: () => {
        throw Error("Second generator must not run");
      },
    });
  first.then(
    (value) => {
      done = true;
      result = { value };
    },
    (error) => {
      done = true;
      result = { error: portable(error) };
    },
  );
  let timers = 0;
  for (let tick = 0; tick < 250 && !done; tick++) {
    await flush();
    if (w.scheduled.length) {
      const timer = w.scheduled.shift();
      timers++;
      w.events.push(["timer", timer.delay]);
      w.now += timer.delay;
      timer.callback();
    }
  }
  await flush();
  assert.equal(done, true, "Controlled identity promise failed to settle");
  return {
    input: portable(input),
    ...result,
    samePromise,
    generations,
    timers,
    events: portableIoEvents(w.events),
    files: portable([...w.files].sort(([a], [b]) => a.localeCompare(b))),
  };
}
