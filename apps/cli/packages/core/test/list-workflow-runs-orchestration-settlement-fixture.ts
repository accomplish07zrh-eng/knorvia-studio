import assert from "node:assert/strict";
import {
  clock,
  row,
  fixture,
  linkAbortSignal,
  executeWithTimeout,
  ToolDeadline,
  resolveTimeoutMs,
  errorShape,
  executorFixture,
  normalized,
} from "./list-workflow-runs-orchestration-fixture.js";
export async function edge(
  selected: any,
  driver: string,
  stage: string,
  depth: number,
  flavor: string,
  early = false,
) {
  return clock(async () => {
    const external = new AbortController(),
      tape: string[] = [];
    let fired = false,
      calls = 0;
    const fire = (name: string) => {
      tape.push(name);
      if (fired || name !== stage) return;
      fired = true;
      const queue = (n: number) =>
        n === 0 ? external.abort("Synthetic queued abort") : queueMicrotask(() => queue(n - 1));
      queue(depth);
    };
    const result = {
      runs: [
        {
          ...row,
          get spentTokens() {
            fire("row.complete");
            return 7;
          },
        },
      ],
      get truncated() {
        fire("result.complete");
        return true;
      },
    };
    const port = {
      listRuns(this: any, ...args: any[]) {
        assert.equal(this, port);
        assert.equal(args.length, 1);
        calls++;
        fire("port.accepted");
        if (flavor === "queued")
          return Object.defineProperty({}, "then", {
            value(resolve: any) {
              queueMicrotask(() => resolve(result));
            },
          });
        return result;
      },
    };
    if (early) external.abort("Synthetic early abort");
    let observed: any;
    if (driver === "deadline") {
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
            {},
            f.context,
            new ToolDeadline(resolveTimeoutMs(selected, {})),
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
    return {
      driver,
      stage,
      depth,
      flavor,
      early,
      fired,
      calls,
      tape,
      observed,
      aborted: external.signal.aborted,
    };
  });
}
export const edgeCases = ["deadline", "executor"].flatMap((driver) =>
  ["port.accepted", "row.complete", "result.complete"].flatMap((stage) =>
    ["sync", "queued"].flatMap((flavor) =>
      Array.from({ length: 9 }, (_, depth) => ({ driver, stage, flavor, depth })),
    ),
  ),
);
