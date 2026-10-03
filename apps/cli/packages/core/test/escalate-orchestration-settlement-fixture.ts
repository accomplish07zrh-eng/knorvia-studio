// Original versus final comparisons use actual deadline/call-runner owners and synchronous ports.
import assert from "node:assert/strict";
import {
  clock,
  entry,
  executeWithTimeout,
  executorFixture,
  fixture,
  gate,
  errorShape,
  linkAbortSignal,
  normalizedExecutor,
  ToolDeadline,
} from "./escalate-orchestration-fixture.js";
export const settlementCases = ["answered", "refused"].flatMap((kind) =>
  ["sync", "thenable"].flatMap((flavor) =>
    ["port.accepted", "projection.begin", "projection.complete"].flatMap((stage) =>
      Array.from({ length: 7 }, (_, depth) => ({ kind, flavor, stage, depth })),
    ),
  ),
);
export async function settlement(
  selected: any,
  driver: string,
  kind: string,
  flavor: string,
  stage: string,
  depth: number,
  early = false,
) {
  return clock(async () => {
    const direct = fixture({ label: "settlement" }),
      external = direct.controller,
      tape: string[] = [],
      requests: any[] = [];
    let fired = false;
    function edge(name: string) {
      tape.push(name);
      if (name !== stage || fired) return;
      fired = true;
      const queue = (remaining: number) =>
        remaining === 0
          ? external.abort("Synthetic completion-edge abort")
          : queueMicrotask(() => queue(remaining - 1));
      queue(depth);
    }
    const outcome = {
      get kind() {
        edge("projection.begin");
        return kind;
      },
      answer: "synthetic answer",
      message: "synthetic refusal",
      get qid() {
        edge("projection.complete");
        return "synthetic-qid";
      },
      get reason() {
        edge("projection.complete");
        return "no_active_ask";
      },
    };
    const port = {
      escalate(this: unknown, ...args: any[]) {
        assert.equal(this, port);
        assert.equal(args.length, 1);
        requests.push(args[0]);
        edge("port.accepted");
        return flavor === "thenable"
          ? Object.defineProperty({}, "then", {
              enumerable: true,
              configurable: true,
              writable: true,
              value(resolve: any) {
                tape.push("thenable.resolve");
                resolve(outcome);
              },
            })
          : outcome;
      },
    };
    if (early) external.abort("Synthetic early abort");
    let observed: any;
    if (driver === "deadline") {
      const controller = new AbortController(),
        unlink = linkAbortSignal(external.signal, controller);
      Object.defineProperties(direct.context, {
        workflowEscalatePort: { value: port, configurable: true },
        abortSignal: { value: controller.signal, configurable: true },
      });
      try {
        observed = {
          success: true,
          output: await executeWithTimeout(
            selected.handler,
            { question: "synthetic" },
            direct.context,
            new ToolDeadline(undefined),
            controller,
            selected,
          ),
        };
      } catch (error) {
        observed = { success: false, error: errorShape(error) };
      } finally {
        unlink();
      }
    } else {
      const f = executorFixture(
        { label: "settlement", input: { question: "synthetic" } },
        selected,
      );
      f.deps.workflowEscalatePort = port as any;
      const result = await f.execute({ signal: external.signal });
      observed = normalizedExecutor(f, result);
      assert.equal(f.terminal().length, 1);
      assert.equal(f.terminal()[0].name, result.success ? "finishCompleted" : "finishCancelled");
      assert.equal(
        f.events.filter((e: any) => ["tool_call_result", "tool_call_error"].includes(e.type))
          .length,
        early ? 0 : 1,
      );
      assert.equal(result.turnControl, undefined);
      for (const request of requests) assert.equal(request.trace, f.contexts[0].traceContext);
    }
    await new Promise((resolve) => setImmediate(resolve));
    return {
      driver,
      kind,
      flavor,
      stage,
      depth,
      early,
      fired,
      aborted: external.signal.aborted,
      tape,
      callCount: requests.length,
      observed,
    };
  });
}
export async function delayedObservation(selected: any = entry, stale = false) {
  return clock(async () => {
    const first = executorFixture({ label: "delayed first" }, selected),
      second = executorFixture({ label: "delayed next" }, selected);
    first.call.id = "synthetic-first" as any;
    second.call.id = "synthetic-second" as any;
    const entered = gate(),
      release = gate<any>(),
      calls: string[] = [];
    const port = {
      escalate(this: unknown, request: any) {
        assert.equal(this, port);
        calls.push(request.toolCallId);
        if (request.toolCallId === "synthetic-first") {
          entered.resolve();
          return release.promise;
        }
        return { kind: "answered", answer: "synthetic second answer", qid: "synthetic-second-qid" };
      },
    };
    first.deps.workflowEscalatePort = second.deps.workflowEscalatePort = port as any;
    let settled = false;
    const pending = first.execute().then((result: any) => {
      settled = true;
      return result;
    });
    await entered.promise;
    assert.equal(settled, false);
    if (stale) first.direct.controller.abort("Synthetic stale first");
    const current = await second.execute();
    assert.equal(current.success, true);
    if (!stale)
      release.resolve({
        kind: "refused",
        message: "synthetic delayed refusal",
        reason: "no_active_ask",
      });
    const initial = await pending;
    if (stale)
      release.resolve({
        kind: "answered",
        answer: "synthetic late answer",
        qid: "synthetic-late-qid",
      });
    await new Promise((resolve) => setImmediate(resolve));
    return {
      calls,
      first: normalizedExecutor(first, initial),
      second: normalizedExecutor(second, current),
    };
  });
}
