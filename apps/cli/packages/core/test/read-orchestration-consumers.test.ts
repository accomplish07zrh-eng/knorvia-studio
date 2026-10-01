import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CoreErrorType, SessionEventType } from "@knorvia/contracts";
import { gate } from "./tool-invocation-fixture.js";
import { executorCases } from "./read-orchestration-cases.js";
import { CWD, ROOT, clock, entry, fixture } from "./read-orchestration-fixture.js";
import {
  createToolRegistry,
  executorFixture,
  handlers,
  observeExecutor,
  permissionObservations,
  registryObservation,
  registryVariants,
} from "./read-orchestration-consumer-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./read-orchestration-contract.json", import.meta.url), "utf8"),
);
test("actual Read built-in registry, declaration filtering and permission decisions stay frozen", () => {
  assert.deepEqual(registryVariants.map(registryObservation), frozen.registry);
  assert.deepEqual(permissionObservations(), frozen.permissions);
  assert.equal(frozen.permissions.length, 20);
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, { allowedTools: ["Read"] });
  assert.equal(registry.get("Read").handler, entry.handler);
  assert.equal(registry.get("Read").validateInput, entry.validateInput);
  assert.equal(registry.get("Read").formatModelContent, entry.formatModelContent);
});
test("real executor freezes outputs/prose/media/failures/display/events/metadata and read-only facts", async () => {
  for (const [i, c] of executorCases.entries())
    assert.deepEqual(await observeExecutor(c), frozen.executor[i].observed, c.label);
});
test("declaration/PDF validation occurs before hooks/permission/ports and retains distinct preflight errors", async () => {
  for (const input of [
    null,
    { file_path: "synthetic.pdf", pages: "0" },
    { file_path: "synthetic.txt", pages: "1" },
    { file_path: "/dev/zero" },
    { file_path: "blocked.zip" },
  ]) {
    const f = executorFixture({ label: "preflight", input, pdf: true });
    const result = await f.execute();
    const ignoredPages = input?.file_path === "synthetic.txt";
    assert.equal(result.success, ignoredPages);
    if (ignoredPages) {
      assert.equal(result.output.type, "text");
      assert.equal(f.direct.calls.filter((c) => c.target === "readTextFileRange").length, 1);
    } else assert.equal(f.direct.calls.length, 0);
    if (!ignoredPages && (input?.file_path?.endsWith(".pdf") || input?.pages !== undefined)) {
      assert.equal(f.timeline.includes("PreToolUse"), false);
      assert.equal(f.timeline.includes("permission"), false);
    }
  }
});
test("permission/approval/hook refusal and pre-cancellation have no synthetic read or snapshot effects", async () => {
  for (const refusal of ["deny", "ask", "hook", "abort"]) {
    const f = executorFixture(
      { label: refusal },
      refusal === "deny" ? "deny" : refusal === "ask" ? "ask" : "allow",
    );
    if (refusal === "ask") f.behavior.reply = { decision: "deny" };
    if (refusal === "hook")
      f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
    const controller = new AbortController();
    if (refusal === "abort") controller.abort("Synthetic pre-cancel");
    assert.equal((await f.execute({ signal: controller.signal })).success, false);
    assert.equal(f.direct.calls.length, 0);
    assert.equal(f.direct.states.size, 0);
  }
});
test("delayed stat precedes snapshot lookup, then exactly one bound range read and completion", async () =>
  clock(async () => {
    const f = fixture({ label: "delayed stat" }),
      entered = gate(),
      release = gate();
    const original = f.fs.stat;
    f.fs.stat = async function (...args: any[]) {
      assert.equal(this, f.fs);
      entered.resolve();
      await release.promise;
      return original.apply(this, args);
    };
    const pending = entry.handler(f.input, f.context);
    await entered.promise;
    assert.equal(f.states.size, 0);
    assert.equal(f.calls.length, 0);
    release.resolve();
    assert.equal((await pending).type, "text");
    assert.equal(f.calls.filter((c) => c.target === "stat").length, 1);
    assert.equal(f.calls.filter((c) => c.target === "readTextFileRange").length, 1);
    assert.equal(f.metadata.length, 1);
  }));
test("delayed range does not commit before successful lower projection", async () =>
  clock(async () => {
    const f = fixture({ label: "delayed range" }),
      entered = gate(),
      release = gate();
    const original = f.fs.readTextFileRange;
    f.fs.readTextFileRange = async function (...args: any[]) {
      entered.resolve();
      await release.promise;
      return original.apply(this, args);
    };
    const pending = entry.handler(f.input, f.context);
    await entered.promise;
    assert.equal(f.states.size, 0);
    assert.equal(f.metadata.length, 0);
    release.resolve();
    await pending;
    assert.equal(f.states.size, 1);
    assert.equal(f.metadata.length, 1);
  }));
test("rejected delayed range never creates a snapshot or completion receipt", async () => {
  const f = fixture({ label: "rejected delayed" }),
    entered = gate(),
    release = gate();
  f.fs.readTextFileRange = async () => {
    entered.resolve();
    await release.promise;
    throw f.originalError;
  };
  const pending = entry.handler(f.input, f.context);
  await entered.promise;
  release.resolve();
  await assert.rejects(pending, (e) => e === f.originalError);
  assert.equal(f.states.size, 0);
  assert.equal(f.metadata.length, 0);
});
test("actual executor interruption preserves port signal and rejects late success/duplicate events", async () =>
  clock(async () => {
    for (const target of ["stat", "readTextFileRange", "readBinaryFile", "prepareForModel"]) {
      const f = executorFixture({
          label: "interrupted",
          ...(target === "readBinaryFile" || target === "prepareForModel" ? { suffix: "png" } : {}),
        }),
        entered = gate(),
        release = gate();
      const owner = target === "prepareForModel" ? f.direct.image : f.direct.fs,
        original = owner[target];
      let count = 0;
      owner[target] = async function (...args: any[]) {
        assert.equal(this, owner);
        assert.equal(args[1].signal, f.observed.contexts[0].abortSignal);
        count++;
        entered.resolve();
        await release.promise;
        return original.apply(this, args);
      };
      const controller = new AbortController(),
        pending = f.execute({ signal: controller.signal });
      await entered.promise;
      controller.abort("Synthetic interruption");
      const result = await pending;
      assert.equal(result.error.type, CoreErrorType.ToolCancelled);
      assert.equal(result.readFileStateMetadata, undefined);
      assert.equal(result.turnControl, undefined);
      release.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(count, 1);
      assert.equal(f.events.filter((e) => e.type === SessionEventType.ToolCallResult).length, 0);
      assert.equal(f.events.filter((e) => e.type === SessionEventType.ToolCallError).length, 1);
      assert.deepEqual(
        f.terminal().map((t) => t.name),
        ["finishCancelled"],
      );
    }
  }));
test("direct handler preserves late state completion when a malformed port ignores cancellation", async () =>
  clock(async () => {
    const f = fixture({ label: "direct ignored abort" }),
      entered = gate(),
      release = gate(),
      original = f.fs.readTextFileRange;
    f.fs.readTextFileRange = async function (...args: any[]) {
      entered.resolve();
      await release.promise;
      return original.apply(this, args);
    };
    const pending = entry.handler(f.input, f.context);
    await entered.promise;
    f.controller.abort("Synthetic ignored abort");
    release.resolve();
    assert.equal((await pending).type, "text");
    assert.equal(f.states.size, 1);
    assert.equal(f.metadata.length, 1);
  }));
test("concurrent callers retain the existing shared map and final completion ordering", async () =>
  clock(async () => {
    const f = fixture({ label: "concurrent" }),
      first = gate(),
      second = gate(),
      entered = gate();
    let count = 0;
    f.fs.readTextFileRange = async function () {
      const ordinal = ++count;
      if (count === 2) entered.resolve();
      await (ordinal === 1 ? first : second).promise;
      return { ...f.range, content: `synthetic-${ordinal}` };
    };
    const one = entry.handler(f.input, f.context),
      two = entry.handler(f.input, f.context);
    await entered.promise;
    second.resolve();
    assert.equal((await two).content, "synthetic-2");
    first.resolve();
    assert.equal((await one).content, "synthetic-1");
    assert.equal(f.states.size, 1);
    assert.equal([...f.states.values()][0].content, "synthetic-1");
    assert.equal(f.metadata.length, 2);
  }));
test("actual executor publishes snapshot metadata on text and unchanged results, never media", async () =>
  clock(async () => {
    const f = executorFixture({ label: "metadata result" });
    const first = await f.execute();
    assert.equal(first.readFileStateMetadata.content, "synthetic\nlines");
    f.call.id = "synthetic-next-call" as any;
    const second = await f.execute();
    assert.equal(second.output.type, "file_unchanged");
    assert.ok(second.readFileStateMetadata.readAtMs > first.readFileStateMetadata.readAtMs);
    assert.equal(second.readFileStateMetadata.revisionId, first.readFileStateMetadata.revisionId);
    const image = executorFixture({ label: "image", suffix: "png" });
    assert.equal((await image.execute()).readFileStateMetadata, undefined);
    assert.equal(image.direct.states.size, 0);
  }));
test("current timeout resolution remains 30 seconds for text and 150 seconds only for supported PDF pages", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.UTC(2026, 1, 3, 4, 5, 6) });
  for (const pdf of [false, true]) {
    const f = executorFixture({
        label: "deadline",
        ...(pdf ? { input: { file_path: "synthetic.pdf", pages: "1" }, pdf: true } : {}),
      }),
      entered = gate(),
      release = gate();
    f.direct.fs.stat = async () => {
      entered.resolve();
      await release.promise;
      return f.direct.stat;
    };
    let settled = false;
    const pending = f.execute().then((r) => {
      settled = true;
      return r;
    });
    await entered.promise;
    t.mock.timers.tick(30001);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, !pdf);
    if (pdf) t.mock.timers.tick(120000);
    assert.equal((await pending).error.type, CoreErrorType.ToolTimeout);
    release.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }
});
test("model-facing PDF contract/default Read description and workspace facts remain unchanged", () => {
  const without = entry.resolveModelContract({
      model: { properties: { inputFormat: { supportsPdf: false } } },
    }),
    withPdf = entry.resolveModelContract({
      model: { properties: { inputFormat: { supportsPdf: true } } },
    });
  assert.equal(without.description, entry.metadata.description);
  assert.match(withPdf.description, /Reads PDFs via the `pages` parameter/u);
  assert.equal(CWD.startsWith(ROOT), true);
  assert.equal(entry.metadata.readOnly, true);
});
