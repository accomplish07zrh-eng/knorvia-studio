import assert from "node:assert/strict";
import { stableChildObservation, type ChildCase } from "./script-child-fixture.js";

export const childIpcCases: ChildCase[] = [
  {
    name: "out-of-order, unknown, duplicate and invalid responses retain the IPC owner",
    async run(child) {
      const queued: any[] = [];
      const result = await child({
        args: { synthetic: 0 },
        budgetTotal: 4,
        body: `phase("planning"); log({ toString() { return "synthetic log"; } });
          const values = await Promise.all([agent("left", {phase:"left"}), agent("right", {phase:""})]);
          return { values, args, total:budget.total, spent:budget.spent(), remaining:budget.remaining() };`,
        respond(request, send) {
          queued.push(request);
          if (queued.length !== 2) return;
          send(" \n{invalid\n");
          send({ kind: "event", id: request.id, ok: true });
          send({ kind: "response", id: "unknown", ok: true, value: "ignored" });
          send({
            kind: "response",
            id: queued[1].id,
            ok: true,
            value: { value: "R", stats: { tokens: { total: "3" } } },
          });
          send({
            kind: "response",
            id: queued[0].id,
            ok: true,
            value: { value: "L", stats: { tokens: { total: 2 } } },
          });
          send({ kind: "response", id: queued[0].id, ok: false, error: "duplicate ignored" });
        },
      });
      assert.deepEqual(result.frames.at(-1), {
        kind: "complete",
        ok: true,
        value: { values: ["L", "R"], args: { synthetic: 0 }, total: 4, spent: 5, remaining: 0 },
      });
      assert.deepEqual(result.frames.slice(0, 2), [
        { kind: "event", type: "phase", payload: { title: "planning" } },
        { kind: "event", type: "log", payload: { message: "synthetic log", phase: "planning" } },
      ]);
      assert.deepEqual(
        queued.map((request) => [request.payload.callPath, request.payload.phase]),
        [
          ["root/agent0", "left"],
          ["root/agent1", "planning"],
        ],
      );
      assert.ok(result.stderr.includes("Invalid workflow runner response"));
      return stableChildObservation(result);
    },
  },
  {
    name: "agent rejection fallback and workflow forwarding retain false values and no budget",
    async run(child) {
      const result = await child({
        body: `let error; try { await agent("refused"); } catch (failure) { error = failure.message; }
          const value = await workflow("synthetic/ref", {zero:0});
          return { error, value, total:budget.total, spent:budget.spent(), unlimited:budget.remaining()===Infinity };`,
        respond(request, send) {
          send(
            request.type === "agent"
              ? { kind: "response", id: request.id, ok: false, error: "" }
              : { kind: "response", id: request.id, ok: true, value: false },
          );
        },
      });
      assert.deepEqual(result.frames.at(-1)?.value, {
        error: "Workflow runner request failed",
        value: false,
        total: null,
        spent: 0,
        unlimited: true,
      });
      assert.deepEqual(result.frames[1]?.payload, {
        args: { zero: 0 },
        nameOrRef: "synthetic/ref",
      });
      return stableChildObservation(result);
    },
  },
  {
    name: "Date/random/process limits and console routing retain deterministic helpers",
    async run(child) {
      const result = await child({
        budgetTotal: 0,
        body: `console.log("synthetic workflow stderr");
          const failures = [()=>new Date(), ()=>Date.now(), ()=>Math.random()].map(run=>{try{run();}catch(error){return error.message;}});
          const descriptor = Object.getOwnPropertyDescriptor(globalThis,"process");
          return {failures, noProcess:process===undefined, descriptor:[descriptor.configurable,descriptor.writable],
            date:new Date(0).getTime(), parsed:Date.parse("1970-01-01T00:00:00.000Z"), utc:Date.UTC(1970,0,1),
            total:budget.total, remaining:budget.remaining()};`,
      });
      assert.deepEqual(result.frames.at(-1)?.value, {
        failures: [
          "argless new Date() is disabled in workflows",
          "Date.now() is disabled in workflows",
          "Math.random() is disabled in workflows",
        ],
        noProcess: true,
        descriptor: [false, false],
        date: 0,
        parsed: 0,
        utc: 0,
        total: 0,
        remaining: 0,
      });
      assert.ok(result.stderr.includes("synthetic workflow stderr"));
      return stableChildObservation(result);
    },
  },
  {
    name: "non-Error failures, syntax errors and serialization errors complete once",
    async run(child) {
      const results = [];
      for (const [body, message, stack] of [
        ['throw "synthetic failure";', "synthetic failure", false],
        ["return {value:1n};", "Do not know how to serialize a BigInt", true],
        ["return (;", "Unexpected token ';'", true],
      ] as const) {
        const result = await child({ body });
        const frame = result.frames.at(-1)!;
        assert.equal(frame.ok, false);
        assert.equal(frame.error, message);
        assert.equal(typeof frame.stack === "string", stack);
        assert.deepEqual(
          Object.keys(frame),
          stack ? ["error", "kind", "ok", "stack"] : ["error", "kind", "ok"],
        );
        results.push(stableChildObservation(result));
      }
      return results;
    },
  },
];
