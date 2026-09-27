// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeReplSession } from "../src/repl/node-repl-session.js";

test("session retains bindings, returns structured errors and scopes logs to one call", async () => {
  const session = new NodeReplSession();
  try {
    assert.deepEqual(
      await session.run(
        "const saved = 40; console.log('hello', {n:2}); nodeRepl.write('tail'); saved + 2",
      ),
      {
        result: "42",
        logs: 'hello {\n  "n": 2\n}\ntail',
      },
    );
    assert.deepEqual(await session.run("saved"), { result: "40", logs: "" });
    const failed = await session.run("const beforeFailure = 7; throw new TypeError('sample');");
    assert.equal(failed.error?.name, "TypeError");
    assert.equal(failed.error?.message, "sample");
    assert.equal((await session.run("saved + beforeFailure")).result, "47");
    assert.equal((await session.run("const = ;")).error?.name, "SyntaxError");
    assert.equal((await session.run("saved")).result, "40");
  } finally {
    session.dispose();
  }
});

test("request metadata and injected symbol globals remain available without leaking previous metadata", async () => {
  const session = new NodeReplSession({
    injectedGlobals: { [Symbol.for("knorvia.contract.fixture")]: 42 },
  });
  try {
    const result = await session.run(
      "[nodeRepl.requestMeta.traceId, globalThis[Symbol.for('knorvia.contract.fixture')], typeof nodeRepl.cwd, typeof nodeRepl.homeDir, typeof nodeRepl.tmpDir]",
      { requestMeta: { traceId: "fixture" } },
    );
    assert.deepEqual(JSON.parse(result.result!), ["fixture", 42, "string", "string", "string"]);
    assert.equal((await session.run("nodeRepl.requestMeta")).result, "{}");
  } finally {
    session.dispose();
  }
});

test("images accept byte and object forms, preserve MIME and reject malformed input", async () => {
  const session = new NodeReplSession();
  try {
    const result = await session.run(
      "nodeRepl.emitImage(Buffer.from([1,2,3])); nodeRepl.emitImage(new Uint8Array([4,5,6])); nodeRepl.emitImage({bytes:[7,8],mimeType:'image/webp'}); nodeRepl.emitImage({base64:'CQo=',mimeType:'image/jpeg'}); nodeRepl.emitImage({dataUrl:'data:image/jpeg;base64,Cww='});",
    );
    assert.deepEqual(result.images, [
      { base64: "AQID", mimeType: "image/png" },
      { base64: "BAUG", mimeType: "image/png" },
      { base64: "Bwg=", mimeType: "image/webp" },
      { base64: "CQo=", mimeType: "image/jpeg" },
      { base64: "Cww=", mimeType: "image/jpeg" },
    ]);
    assert.equal((await session.run("nodeRepl.emitImage({base64:''})")).error?.name, "TypeError");
    assert.equal((await session.run("nodeRepl.emitImage(123)")).error?.name, "TypeError");
    assert.equal((await session.run("1")).images, undefined);
  } finally {
    session.dispose();
  }
});

test("trusted screenshot counts and last CUA identity come only from host records in this run", async () => {
  const image = { base64: "AQID", mimeType: "image/png" };
  const session = new NodeReplSession({
    injectedGlobals: {
      record: () => {
        session.recordBrowserScreenshot(image);
        session.recordCuaAppIdentity({ appKey: "app:first" });
        session.recordCuaAppIdentity({ appKey: "app:last", displayName: "Last" });
      },
    },
  });
  try {
    const result = await session.run(
      "record(); nodeRepl.emitImage({base64:'AQID',mimeType:'image/png'}); nodeRepl.emitImage({base64:'AQID',mimeType:'image/png'});",
    );
    assert.deepEqual(result.browserScreenshotImageIndices, [0]);
    assert.deepEqual(result.cuaApp, { appKey: "app:last", displayName: "Last" });
    const next = await session.run("nodeRepl.emitImage({base64:'AQID',mimeType:'image/png'});");
    assert.equal(next.browserScreenshotImageIndices, undefined);
    assert.equal(next.cuaApp, undefined);
    assert.equal(
      (
        await session.run(
          "typeof nodeRepl.recordCuaAppIdentity + ':' + typeof nodeRepl.recordBrowserScreenshot",
        )
      ).result,
      "undefined:undefined",
    );
  } finally {
    session.dispose();
  }
});

test("structured results and model versus host metadata retain their distinct merge contracts", async () => {
  const session = new NodeReplSession({
    injectedGlobals: {
      merge: () => session.mergeResponseMeta({ "knorvia/toolSurface": { c: 4 }, host: true }),
    },
  });
  try {
    const result = await session.run(
      "nodeRepl.setResponseMeta({'knorvia/toolSurface':{a:1,b:2},custom:{one:1}}); nodeRepl.setResponseMeta({'knorvia/toolSurface':{b:3},custom:{two:2}}); merge(); nodeRepl.emitStructuredResult({content:[{type:'text',text:'ok'}],isError:false,structuredContent:{answer:42},_meta:{test:true}});",
    );
    assert.deepEqual(JSON.parse(JSON.stringify(result.responseMeta)), {
      "knorvia/toolSurface": { b: 3, c: 4 },
      custom: { two: 2 },
      host: true,
    });
    assert.equal(result.structuredResults?.[0]?.content[0]?.type, "text");
    assert.deepEqual(JSON.parse(JSON.stringify(result.structuredResults?.[0]?.structuredContent)), {
      answer: 42,
    });
    assert.equal(
      (await session.run("nodeRepl.emitStructuredResult({content:[{missing:'type'}]})")).error
        ?.name,
      "TypeError",
    );
    assert.equal((await session.run("nodeRepl.setResponseMeta(7)")).error?.name, "TypeError");
  } finally {
    session.dispose();
  }
});

test("restricted process is consistent across global, require and dynamic import without exposing stdio control", async () => {
  const session = new NodeReplSession({ restrictProcess: true });
  try {
    const result = await session.run(
      "const importedProcess = await import('node:process'); [process === require('process'), importedProcess.default === process, typeof process.exit, typeof process.kill, typeof process.stdout, Object.isFrozen(process), Object.isFrozen(process.env), typeof process.cwd, typeof require.resolve, typeof require.cache, typeof require.extensions, typeof (await import('node:path')).join]",
    );
    assert.deepEqual(JSON.parse(result.result!), [
      true,
      true,
      "undefined",
      "undefined",
      "undefined",
      true,
      true,
      "function",
      "function",
      "object",
      "object",
      "function",
    ]);
  } finally {
    session.dispose();
  }
});

test("synchronous budget and cancellation reset bindings and rebuild injected capabilities", async () => {
  let generation = 0;
  const effect = { value: 0 };
  const session = new NodeReplSession({
    injectedGlobals: () => ({ generation: ++generation, effect }),
  });
  try {
    await session.run("const saved = 42;");
    const timeout = await session.run("while (true) {}", { syncTimeoutMs: 15 });
    assert.match(timeout.error?.message ?? "", /timed out.*kernel reset/);
    assert.deepEqual(JSON.parse((await session.run("[generation,typeof saved]")).result!), [
      2,
      "undefined",
    ]);
    const before = new AbortController();
    before.abort(new DOMException("before", "AbortError"));
    const skipped = await session.run("effect.value++", { signal: before.signal });
    assert.equal(skipped.error?.name, "AbortError");
    assert.equal(effect.value, 0);
    const during = new AbortController();
    const pending = session.run("await new Promise(()=>{})", { signal: during.signal });
    during.abort(new DOMException("deadline", "TimeoutError"));
    const cancelled = await pending;
    assert.equal(cancelled.error?.name, "TimeoutError");
    assert.match(cancelled.error?.message ?? "", /deadline.*kernel reset/);
    assert.equal((await session.run("generation")).result, "4");
  } finally {
    session.dispose();
  }
});

test("reset and disposal release tracked timers and disposal is idempotent", async () => {
  const effect = { value: 0 };
  const session = new NodeReplSession({ injectedGlobals: { effect } });
  try {
    await session.run(
      "setTimeout(()=>effect.value++,40); setInterval(()=>effect.value++,40); undefined",
    );
    const controller = new AbortController();
    controller.abort();
    await session.run("1", { signal: controller.signal });
    await delay(70);
    assert.equal(effect.value, 0);
    await session.run("setTimeout(()=>effect.value++,40); undefined");
    session.dispose();
    session.dispose();
    await delay(70);
    assert.equal(effect.value, 0);
    assert.equal((await session.run("42")).error?.name, "DisposedError");
  } finally {
    session.dispose();
  }
});

test("cancelled continuations cannot write any output into the next call", async () => {
  let resumeOld!: () => void;
  let resumeNew!: () => void;
  const oldWait = new Promise<void>((resolve) => {
    resumeOld = resolve;
  });
  const newWait = new Promise<void>((resolve) => {
    resumeNew = resolve;
  });
  const session = new NodeReplSession({
    injectedGlobals: {
      oldWait,
      newWait,
      lateHostWrite: () => {
        session.recordBrowserScreenshot({ base64: "AQID", mimeType: "image/png" });
        session.recordCuaAppIdentity({ appKey: "stale" });
        session.mergeResponseMeta({ lateHost: true });
      },
    },
  });
  try {
    const cancel = new AbortController();
    const old = session.run(
      "await oldWait; console.log('stale'); nodeRepl.emitImage({base64:'AQID'}); nodeRepl.emitStructuredResult({content:[{type:'text',text:'stale'}]}); nodeRepl.setResponseMeta({stale:true}); lateHostWrite();",
      { signal: cancel.signal },
    );
    cancel.abort();
    await old;
    const next = session.run("await newWait; console.log('fresh');");
    resumeOld();
    await delay(5);
    resumeNew();
    assert.deepEqual(await next, { logs: "fresh" });
  } finally {
    resumeOld();
    resumeNew();
    session.dispose();
  }
});

test("dynamic JSON import preserves import attributes at the session boundary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-repl-json-"));
  const file = join(directory, "answer.json");
  await writeFile(file, '{"answer":42}');
  const session = new NodeReplSession();
  try {
    const result = await session.run(
      `const data = await import(${JSON.stringify(pathToFileURL(file).href)}, {with:{type:'json'}}); data.default.answer`,
    );
    assert.equal(result.error, undefined);
    assert.equal(result.result, "42");
  } finally {
    session.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("overlapping calls fail explicitly and do not replace the active collector", async () => {
  let resume!: () => void;
  const wait = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const session = new NodeReplSession({ injectedGlobals: { wait } });
  try {
    const first = session.run("console.log('before'); await wait; console.log('after');");
    const overlap = await session.run("console.log('overlap');");
    resume();
    assert.equal(overlap.error?.name, "BusyError");
    assert.equal((await first).logs, "before\nafter");
  } finally {
    resume();
    session.dispose();
  }
});

test("disposal cancels a pending call without allowing it to outlive the session", async () => {
  const session = new NodeReplSession();
  const pending = session.run("await new Promise(()=>{})");
  session.dispose();
  const cancelled = await pending;
  assert.equal(cancelled.error?.name, "AbortError");
  assert.doesNotMatch(cancelled.error?.message ?? "", /kernel reset/);
  assert.equal((await session.run("1")).error?.name, "DisposedError");
});

test("inline cancellation and synchronous interruption leave no unhandled cancellation promise", async () => {
  const controller = new AbortController();
  const session = new NodeReplSession({ injectedGlobals: { stop: () => controller.abort() } });
  try {
    const stopped = await session.run("stop(); while(true) {}", {
      signal: controller.signal,
      syncTimeoutMs: 15,
    });
    assert.match(stopped.error?.message ?? "", /kernel reset/);
    // Node 的测试运行器会将这一轮事件循环中的未处理 rejection 计为失败。
    await delay(0);
    assert.equal((await session.run("42")).result, "42");
  } finally {
    session.dispose();
  }
});

test("VM global built-ins remain accessible and binary completion values use bounded previews", async () => {
  const session = new NodeReplSession();
  try {
    assert.deepEqual(
      JSON.parse(
        (
          await session.run(
            "[typeof globalThis.JSON, typeof globalThis.Promise, globalThis === globalThis.globalThis]",
          )
        ).result!,
      ),
      ["object", "function", true],
    );
    const result = await session.run("new Uint8Array(10000)");
    assert.match(result.result ?? "", /^Uint8Array\(10000\)/);
    assert.match(result.result ?? "", /more items/);
    assert.ok(result.result!.length < 1024);
  } finally {
    session.dispose();
  }
});

test("fractional and non-positive execution budgets retain millisecond clamp semantics", async () => {
  const session = new NodeReplSession();
  try {
    assert.equal((await session.run("42", { syncTimeoutMs: 30.8 })).result, "42");
    const zero = await session.run("while(true) {}", { syncTimeoutMs: 0 });
    assert.match(zero.error?.message ?? "", /timed out after 1ms.*kernel reset/);
  } finally {
    session.dispose();
  }
});

test("unprintable and hostile thrown objects still return a structured error", async () => {
  const session = new NodeReplSession();
  try {
    for (const code of [
      "throw Object.create(null)",
      "throw new Proxy({}, {has(){throw new Error('trap')}})",
      "throw new Proxy({}, {get(){throw new Error('getter trap')}})",
    ]) {
      const result = await session.run(code);
      assert.equal(result.error?.name, "Error");
      assert.ok(result.error?.message);
    }
    assert.equal((await session.run("42")).result, "42");
  } finally {
    session.dispose();
  }
});

test("structured results and metadata are snapshots independent of later cell mutations", async () => {
  const session = new NodeReplSession();
  try {
    const result = await session.run(
      "const payload={content:[{type:'text',text:'original'}],structuredContent:{value:1},_meta:{nested:{value:1}}}; const metadata={nested:{value:1}}; nodeRepl.emitStructuredResult(payload); nodeRepl.setResponseMeta(metadata); undefined",
    );
    await session.run(
      "payload.content[0].text='changed'; payload.structuredContent.value=2; payload._meta.nested.value=2; metadata.nested.value=2;",
    );
    assert.equal(result.structuredResults?.[0]?.content[0]?.text, "original");
    assert.deepEqual(result.structuredResults?.[0]?.structuredContent, { value: 1 });
    assert.deepEqual(result.structuredResults?.[0]?._meta, { nested: { value: 1 } });
    assert.deepEqual(result.responseMeta, { nested: { value: 1 } });
    assert.doesNotThrow(() => structuredClone(result));
  } finally {
    session.dispose();
  }
});

test("non-transferable structured output fails within the cell and preserves its earlier logs", async () => {
  const session = new NodeReplSession();
  try {
    for (const code of [
      "console.log('before'); nodeRepl.emitStructuredResult({content:[{type:'text',text:'x'}],structuredContent:{f(){}}});",
      "console.log('before'); nodeRepl.setResponseMeta({f(){}});",
    ]) {
      const result = await session.run(code);
      assert.equal(result.error?.name, "TypeError");
      assert.equal(result.logs, "before");
      assert.doesNotThrow(() => structuredClone(result));
    }
  } finally {
    session.dispose();
  }
});

test("host records without run ownership cannot attach to an unrelated active call", async () => {
  let resume!: () => void;
  const wait = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const session = new NodeReplSession({ injectedGlobals: { wait } });
  try {
    const pending = session.run("await wait; 42");
    session.recordCuaAppIdentity({ appKey: "unowned" });
    session.recordBrowserScreenshot({ base64: "AQID", mimeType: "image/png" });
    session.mergeResponseMeta({ unowned: true });
    resume();
    assert.deepEqual(await pending, { result: "42", logs: "" });
  } finally {
    resume();
    session.dispose();
  }
});
