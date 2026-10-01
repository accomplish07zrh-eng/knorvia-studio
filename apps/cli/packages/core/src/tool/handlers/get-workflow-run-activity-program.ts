import type { GetWorkflowRunSubagent } from "@knorvia/contracts";
import {
  escapeWorkflowRunText,
  formatRelativeAge,
  formatWorkflowRunDuration,
} from "./workflow-run-introspection.js";

type Frame = {
  subagent: GetWorkflowRunSubagent;
  now: number;
  askedAtByQid: ReadonlyMap<string, number>;
  ask: GetWorkflowRunSubagent["currentAsk"];
  wait: GetWorkflowRunSubagent["wait"];
  age: string | undefined;
  step: string;
  suffix: string;
  target: string;
  after: string;
  retry: string;
};
type Step =
  | readonly ["text", (frame: Frame) => string]
  | readonly ["bind", (frame: Frame) => void]
  | readonly ["if", (frame: Frame) => boolean, readonly Step[], readonly Step[]];
type Program = { separator: string; steps: readonly Step[] };
const text = (read: (f: Frame) => string): Step => ["text", read];
const bind = (apply: (f: Frame) => void): Step => ["bind", apply];
const when = (
  test: (f: Frame) => boolean,
  yes: readonly Step[],
  no: readonly Step[] = [],
): Step => ["if", test, yes, no];

function evaluate(program: Program, frame: Frame): string {
  const parts: string[] = [];
  const visit = (steps: readonly Step[]) => {
    for (const step of steps) {
      switch (step[0]) {
        case "text":
          parts.push(step[1](frame));
          break;
        case "bind":
          step[1](frame);
          break;
        case "if":
          visit(step[1](frame) ? step[2] : step[3]);
          break;
      }
    }
  };
  visit(program.steps);
  return parts.join(program.separator);
}

// actorSeq 是 journal 的 0 基列；模型面按人读的 1 基说「第几步」。
const ADDRESS: Program = {
  separator: "",
  steps: [
    when(
      (f) => f.ask!.actorSeq === undefined,
      [
        bind((f) => {
          f.step = "";
        }),
      ],
      [
        bind((f) => {
          f.step = ` (step ${f.ask!.actorSeq! + 1})`;
        }),
      ],
    ),
    text((f) => `${escapeWorkflowRunText(f.ask!.siteId)}@${f.ask!.ordinal}${f.step}`),
  ],
};
const ELAPSED: readonly Step[] = [
  when(
    (f) => f.age === undefined,
    [
      bind((f) => {
        f.suffix = "";
      }),
    ],
    [
      bind((f) => {
        f.suffix = ` for ${f.age!.replace(/ ago$/u, "")}`;
      }),
    ],
  ),
];
const PARKED: Program = {
  separator: "",
  steps: [
    bind((f) => {
      f.age = formatRelativeAge(f.now, f.askedAtByQid.get(f.subagent.parkedOn!));
    }),
    ...ELAPSED,
    text((f) => `on question ${escapeWorkflowRunText(f.subagent.parkedOn!)}${f.suffix}`),
  ],
};
const WAITING: Program = {
  separator: "",
  steps: [
    bind((f) => {
      f.wait = f.subagent.wait;
    }),
    when(
      (f) => f.wait !== undefined,
      [
        bind((f) => {
          f.age = formatRelativeAge(f.now, f.wait!.since);
        }),
        ...ELAPSED,
        when(
          (f) => f.wait!.cause === "slot",
          [text((f) => `waiting for a slot${f.suffix}`)],
          [
            when(
              (f) => f.wait!.reason === undefined,
              [
                bind((f) => {
                  f.after = "";
                }),
              ],
              [
                bind((f) => {
                  f.after = ` after ${escapeWorkflowRunText(f.wait!.reason!)}`;
                }),
              ],
            ),
            when(
              (f) => f.wait!.retryAfterMs === undefined,
              [
                bind((f) => {
                  f.retry = "";
                }),
              ],
              [
                bind((f) => {
                  f.retry = `, retry in ${formatWorkflowRunDuration(f.wait!.retryAfterMs!)}`;
                }),
              ],
            ),
            // 「等了多久」贴着原因，「还要等多久」收尾：两个时长挨在一起时读者分不清哪个是哪个。
            text((f) => `backoff${f.after}${f.suffix}${f.retry}`),
          ],
        ),
      ],
    ),
  ],
};
const UNFINISHED: Program = {
  separator: "",
  steps: [
    bind((f) => {
      f.ask = f.subagent.currentAsk;
    }),
    text((f) => `${evaluate(ADDRESS, f)} was in flight at the stop`),
  ],
};
const EXECUTING: Program = {
  separator: ", ",
  steps: [
    bind((f) => {
      f.ask = f.subagent.currentAsk;
    }),
    text((f) => evaluate(ADDRESS, f)),
    bind((f) => {
      f.age = formatRelativeAge(f.now, f.ask!.startedAt);
    }),
    when((f) => f.age !== undefined, [text((f) => `${f.age!.replace(/ ago$/u, "")} on this step`)]),
    when((f) => f.ask!.turn !== undefined, [text((f) => `turn ${f.ask!.turn}`)]),
    when(
      (f) => f.ask!.toolCalls !== undefined,
      [text((f) => `${f.ask!.toolCalls} tool call${f.ask!.toolCalls === 1 ? "" : "s"}`)],
    ),
    when(
      (f) => f.ask!.lastTool !== undefined,
      [
        when(
          (f) => f.ask!.lastTool!.target === undefined,
          [
            bind((f) => {
              f.target = "";
            }),
          ],
          [
            bind((f) => {
              f.target = ` ${escapeWorkflowRunText(f.ask!.lastTool!.target!)}`;
            }),
          ],
        ),
        bind((f) => {
          f.age = formatRelativeAge(f.now, f.ask!.lastTool!.at);
        }),
        text(
          (f) =>
            `last ${escapeWorkflowRunText(f.ask!.lastTool!.name)}${f.target}${f.age === undefined ? "" : ` ${f.age}`}`,
        ),
      ],
    ),
  ],
};
const SETTLED: Program = {
  separator: "",
  steps: [
    when(
      (f) => f.subagent.stepsSettled === 0 && f.subagent.stepsFailed === 0,
      [],
      [
        when(
          (f) => f.subagent.stepsFailed > 0,
          [
            bind((f) => {
              f.after = `, ${f.subagent.stepsFailed} failed`;
            }),
          ],
          [
            bind((f) => {
              f.after = "";
            }),
          ],
        ),
        text(
          (f) =>
            `${f.subagent.stepsSettled} step${f.subagent.stepsSettled === 1 ? "" : "s"}${f.after}`,
        ),
      ],
    ),
  ],
};
const ROUTES: readonly (readonly [(f: Frame) => boolean, Program])[] = [
  [(f) => f.subagent.state === "parked" && f.subagent.parkedOn !== undefined, PARKED],
  [(f) => f.subagent.state === "waiting", WAITING],
  [(f) => f.subagent.state === "unfinished" && f.subagent.currentAsk !== undefined, UNFINISHED],
  [(f) => f.subagent.currentAsk !== undefined, EXECUTING],
  [() => true, SETTLED],
];

export function renderWorkflowRunActivity(
  subagent: GetWorkflowRunSubagent,
  now: number,
  askedAtByQid: ReadonlyMap<string, number>,
): string {
  const frame: Frame = {
    subagent,
    now,
    askedAtByQid,
    ask: undefined,
    wait: undefined,
    age: undefined,
    step: "",
    suffix: "",
    target: "",
    after: "",
    retry: "",
  };
  for (const [accept, program] of ROUTES) if (accept(frame)) return evaluate(program, frame);
  return "";
}
