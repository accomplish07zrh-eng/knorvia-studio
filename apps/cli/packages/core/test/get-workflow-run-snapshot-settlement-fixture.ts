import assert from "node:assert/strict";
import {
  clock,
  detail,
  fixture,
  linkAbortSignal,
  executeWithTimeout,
  ToolDeadline,
  resolveTimeoutMs,
  errorShape,
  executorFixture,
  normalized,
} from "./get-workflow-run-snapshot-fixture.js";
export const edges = ["deadline", "executor"].flatMap((driver) =>
  ["port.accepted", "detail.runId", "detail.logTail", "detail.artifacts"].flatMap((stage) =>
    ["sync", "queued"].flatMap((flavor) =>
      Array.from({ length: 7 }, (_, depth) => ({ driver, stage, flavor, depth })),
    ),
  ),
);
export async function edge(selected: any, c: any, early = false) {
  return clock(async () => {
    const external = new AbortController(),
      tape: string[] = [];
    let fired = false,
      calls = 0;
    const fire = (key: string) => {
      tape.push(key);
      if (fired || key !== c.stage) return;
      fired = true;
      const queue = (n: number) =>
        n === 0 ? external.abort("Synthetic completion abort") : queueMicrotask(() => queue(n - 1));
      queue(c.depth);
    };
    const outcome = new Proxy(detail, {
      get(t, k, r) {
        fire(`detail.${String(k)}`);
        return Reflect.get(t, k, r);
      },
    });
    const port = {
      getRunDetail(this: any, ...args: any[]) {
        assert.equal(this, port);
        assert.deepEqual(args, ["synthetic-run"]);
        calls++;
        fire("port.accepted");
        return c.flavor === "queued"
          ? Object.defineProperty({}, "then", {
              value(resolve: any) {
                queueMicrotask(() => resolve(outcome));
              },
            })
          : outcome;
      },
    };
    if (early) external.abort("Synthetic early abort");
    let observed: any;
    if (c.driver === "deadline") {
      const f = fixture(),
        controller = new AbortController(),
        unlink = linkAbortSignal(external.signal, controller);
      Object.defineProperty(f.context, "dynamicWorkflowRunPort", {
        value: port,
        configurable: true,
      });
      f.context.abortSignal = controller.signal;
      try {
        observed = {
          success: true,
          output: await executeWithTimeout(
            selected.handler,
            { run_id: "synthetic-run" },
            f.context,
            new ToolDeadline(resolveTimeoutMs(selected, {}, 10000)),
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
      const f = executorFixture({}, selected);
      f.deps.dynamicWorkflowRunPort = port as any;
      const output = await f.execute({ signal: external.signal });
      observed = normalized(f, output);
      assert.equal(f.terminal().length, 1);
      assert.equal(
        f.events.filter((e: any) => ["tool_call_result", "tool_call_error"].includes(e.type))
          .length,
        early ? 0 : 1,
      );
    }
    await new Promise((resolve) => setImmediate(resolve));
    return { ...c, early, fired, calls, tape, observed, aborted: external.signal.aborted };
  });
}
