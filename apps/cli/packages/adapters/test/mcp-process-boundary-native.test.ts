// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { bounded, deferred, fixture } from "./mcp-process-boundary.fixture.js";

test("default loader shares one pending promise and supports default or namespace Koffi exports", async () => {
  for (const shape of ["default", "namespace"] as const) {
    const h = await fixture();
    const entered = deferred<void>();
    const gate = deferred<unknown>();
    h.imports.load = () => {
      h.record("native.import");
      entered.resolve();
      return gate.promise;
    };
    const a = h.job.attachProcessToWindowsJobObject(42, { platform: "win32" });
    const b = h.job.attachProcessToWindowsJobObject(42, { platform: "win32" });
    await bounded(entered.promise, "owned native import");
    assert.equal(h.count("native.import"), 1);
    assert.equal(h.count("native.load"), 0);
    gate.resolve(shape === "default" ? { default: h.koffi } : h.koffi);
    const controllers = await bounded(Promise.all([a, b]), "owned native ready");
    assert.ok(controllers[0]);
    assert.ok(controllers[1]);
    assert.notEqual(controllers[0], controllers[1]);
    assert.equal(h.count("native.load"), 1);
    assert.deepEqual(h.events("native.load"), [["kernel32.dll"]]);
    assert.ok(h.transforms.some((entry) => entry.koffiImports > 0));
    controllers[0].close();
    controllers[1].close();
  }
});

test("failed import, invalid default, library or binding setup is cached as unavailable", async () => {
  for (const phase of ["import", "default", "load", "struct", "bind"] as const) {
    const h = await fixture();
    const marker = new Error(phase);
    if (phase === "import")
      h.imports.load = async () => {
        h.record("native.import");
        throw marker;
      };
    if (phase === "default") h.imports.namespace = { default: undefined, ...h.koffi };
    if (phase === "load")
      h.koffi.load = () => {
        h.record("native.load");
        throw marker;
      };
    if (phase === "struct")
      h.koffi.struct = () => {
        h.record("native.struct");
        throw marker;
      };
    if (phase === "bind")
      h.library.func = () => {
        h.record("native.bind");
        throw marker;
      };
    assert.equal(await h.job.attachProcessToWindowsJobObject(42, { platform: "win32" }), undefined);
    assert.equal(await h.job.attachProcessToWindowsJobObject(43, { platform: "win32" }), undefined);
    assert.equal(h.count("native.import"), 1);
    assert.equal(h.count("native.call"), 0);
  }
});

test("Windows ABI type layouts, binding order and kill-on-close limits are represented explicitly", async () => {
  const h = await fixture();
  const controller = await h.job.attachProcessToWindowsJobObject(42, { platform: "win32" });
  assert.ok(controller);
  const definitions = new Map(
    h.events("native.struct").map((event) => [event[0], event[1] as Record<string, unknown>]),
  );
  const basic = definitions.get("JOBOBJECT_BASIC_LIMIT_INFORMATION");
  assert.deepEqual(basic, {
    PerProcessUserTimeLimit: "int64",
    PerJobUserTimeLimit: "int64",
    LimitFlags: "uint32",
    MinimumWorkingSetSize: "size_t",
    MaximumWorkingSetSize: "size_t",
    ActiveProcessLimit: "uint32",
    Affinity: "uintptr_t",
    PriorityClass: "uint32",
    SchedulingClass: "uint32",
  });
  assert.deepEqual(Object.keys(basic!), [
    "PerProcessUserTimeLimit",
    "PerJobUserTimeLimit",
    "LimitFlags",
    "MinimumWorkingSetSize",
    "MaximumWorkingSetSize",
    "ActiveProcessLimit",
    "Affinity",
    "PriorityClass",
    "SchedulingClass",
  ]);
  const ioNames = [
    "ReadOperationCount",
    "WriteOperationCount",
    "OtherOperationCount",
    "ReadTransferCount",
    "WriteTransferCount",
    "OtherTransferCount",
  ];
  assert.deepEqual(
    definitions.get("IO_COUNTERS"),
    Object.fromEntries(ioNames.map((name) => [name, "uint64"])),
  );
  assert.deepEqual(Object.keys(definitions.get("IO_COUNTERS")!), ioNames);
  const extended = definitions.get("JOBOBJECT_EXTENDED_LIMIT_INFORMATION");
  assert.ok(extended);
  assert.deepEqual(Object.keys(extended), [
    "BasicLimitInformation",
    "IoInfo",
    "ProcessMemoryLimit",
    "JobMemoryLimit",
    "PeakProcessMemoryUsed",
    "PeakJobMemoryUsed",
  ]);
  assert.equal(
    (extended.BasicLimitInformation as { label: string }).label,
    "JOBOBJECT_BASIC_LIMIT_INFORMATION",
  );
  assert.equal((extended.IoInfo as { label: string }).label, "IO_COUNTERS");
  for (const field of [
    "ProcessMemoryLimit",
    "JobMemoryLimit",
    "PeakProcessMemoryUsed",
    "PeakJobMemoryUsed",
  ])
    assert.equal(extended[field], "size_t");
  const bindings = h.events("native.bind");
  assert.deepEqual(
    bindings.map((event) => event[1]),
    [
      "CreateJobObjectW",
      "SetInformationJobObject",
      "OpenProcess",
      "AssignProcessToJobObject",
      "TerminateJobObject",
      "CloseHandle",
    ],
  );
  assert.ok(bindings.every((event) => event[0] === "__stdcall"));
  const handle = bindings[0]?.[2];
  assert.equal((handle as { label: { pointer: unknown[] } }).label.pointer[0], "HANDLE");
  const createArgs = bindings[0]?.[3] as unknown[];
  assert.equal(String(createArgs[0]).replaceAll(" ", ""), "void*");
  assert.equal(createArgs[1], "str16");
  assert.equal(bindings[1]?.[2], "bool");
  const setArguments = bindings[1]?.[3];
  assert.ok(Array.isArray(setArguments));
  assert.deepEqual(setArguments.slice(0, 2), [handle, "uint32"]);
  assert.equal(setArguments[3], "uint32");
  assert.equal(bindings[2]?.[2], handle);
  assert.deepEqual(bindings[2]?.[3], ["uint32", "bool", "uint32"]);
  assert.deepEqual(bindings[3]?.slice(2), ["bool", [handle, handle]]);
  assert.deepEqual(bindings[4]?.slice(2), ["bool", [handle, "uint32"]]);
  assert.deepEqual(bindings[5]?.slice(2), ["bool", [handle]]);
  const create = h.events("native.call").find((event) => event[0] === "CreateJobObjectW");
  assert.deepEqual(create, ["CreateJobObjectW", null, null]);
  const set = h.events("native.call").find((event) => event[0] === "SetInformationJobObject");
  assert.equal(set?.[2], 9);
  assert.equal(set?.[4], 144);
  const limits = set?.[3] as Record<string, unknown>;
  assert.deepEqual(limits, {
    BasicLimitInformation: {
      ...Object.fromEntries(Object.keys(basic!).map((name) => [name, 0])),
      LimitFlags: 0x2000,
    },
    IoInfo: Object.fromEntries(ioNames.map((name) => [name, 0])),
    ProcessMemoryLimit: 0,
    JobMemoryLimit: 0,
    PeakProcessMemoryUsed: 0,
    PeakJobMemoryUsed: 0,
  });
  controller.close();
});

test("native assignment requests exact rights, closes the process handle first and ignores BOOL termination results", async () => {
  const h = await fixture();
  const controller = await h.job.attachProcessToWindowsJobObject(77, { platform: "win32" });
  assert.ok(controller);
  const calls = h.events("native.call");
  assert.deepEqual(
    calls.map((event) => event[0]),
    [
      "CreateJobObjectW",
      "SetInformationJobObject",
      "OpenProcess",
      "AssignProcessToJobObject",
      "CloseHandle",
    ],
  );
  assert.deepEqual(calls[2], ["OpenProcess", 0x0101, false, 77]);
  const jobHandle = calls[1]?.[1];
  const processHandle = calls[3]?.[2];
  assert.equal(calls[3]?.[1], jobHandle);
  assert.equal(calls[4]?.[1], processHandle);
  controller.terminate();
  controller.close();
  controller.terminate();
  controller.close();
  assert.deepEqual(h.events("native.call").slice(5), [
    ["TerminateJobObject", jobHandle, 1],
    ["CloseHandle", jobHandle],
  ]);
});

test("native create failures keep the documented limited cleanup ownership", async () => {
  for (const phase of ["create-empty", "set-false", "set-throw", "sizeof-throw"] as const) {
    const h = await fixture();
    if (phase === "create-empty") h.nativeActions.set("CreateJobObjectW", () => null);
    if (phase === "set-false") h.nativeActions.set("SetInformationJobObject", () => false);
    if (phase === "set-throw")
      h.nativeActions.set("SetInformationJobObject", () => {
        throw new Error("set");
      });
    if (phase === "sizeof-throw")
      h.koffi.sizeof = () => {
        throw new Error("sizeof");
      };
    assert.equal(await h.job.attachProcessToWindowsJobObject(42, { platform: "win32" }), undefined);
    const names = h.events("native.call").map((event) => event[0]);
    assert.equal(names.includes("OpenProcess"), false);
    assert.equal(
      names.filter((name) => name === "CloseHandle").length,
      phase === "set-false" ? 1 : 0,
    );
  }
});

test("assignment failure and process-handle close errors trigger outer job cleanup without escaping", async () => {
  for (const phase of ["open-empty", "assign-false", "assign-throw", "process-close"] as const) {
    const h = await fixture();
    if (phase === "open-empty") h.nativeActions.set("OpenProcess", () => undefined);
    if (phase === "assign-false") h.nativeActions.set("AssignProcessToJobObject", () => false);
    if (phase === "assign-throw")
      h.nativeActions.set("AssignProcessToJobObject", () => {
        throw new Error("assign");
      });
    if (phase === "process-close")
      h.nativeActions.set("CloseHandle", (handle) => {
        if ((handle as { kind: string }).kind === "process") throw new Error("process close");
        return false;
      });
    assert.equal(await h.job.attachProcessToWindowsJobObject(42, { platform: "win32" }), undefined);
    const closes = h.events("native.call").filter((event) => event[0] === "CloseHandle");
    assert.equal(closes.length, phase === "open-empty" ? 1 : 2);
    const finalClose = closes.at(-1);
    assert.ok(finalClose);
    assert.equal((finalClose[1] as { kind: string }).kind, "job");
  }
});
