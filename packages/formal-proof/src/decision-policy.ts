import type { Candidate, Decision, ProductContext, QueueState, RunPhase } from "./model-types.js";

type Action = "text" | "goal" | "compact" | "fork" | "edit";
interface Recipe {
  readonly kind: "allow" | "reject" | "enqueue" | "choice";
  readonly ruleId: string;
  readonly title: string;
  readonly reason?: string;
  readonly next?: (context: ProductContext, candidate: Candidate) => ProductContext;
}
type Rule = Recipe | ((context: ProductContext) => Recipe);

const actionIds = new Map<string, Action>([
  ["sendText", "text"],
  ["setGoal", "goal"],
  ["compact", "compact"],
  ["slashCompact", "compact"],
  ["forkLatest", "fork"],
  ["forkOld", "fork"],
  ["editLatest", "edit"],
  ["editOld", "edit"],
]);
const queue = (ruleId: string, reason: string): Recipe => ({
  kind: "enqueue",
  ruleId,
  reason,
  title: "",
});
const deny = (ruleId: string, title: string, reason: string): Recipe => ({
  kind: "reject",
  ruleId,
  title,
  reason,
});
const allow = (ruleId: string, title: string, next: NonNullable<Recipe["next"]>): Recipe => ({
  kind: "allow",
  ruleId,
  title,
  next,
});
const choice = (title: string, reason: string): Recipe => ({
  kind: "choice",
  ruleId: "heldQueueInputRequiresChoice",
  title,
  reason,
});
const send = (context: ProductContext): ProductContext => ({
  ...context,
  runPhase: "running",
  queue: "empty",
});
const activateGoal = (context: ProductContext): ProductContext => ({ ...context, goal: "active" });

const phases = new Map<RunPhase, ReadonlyMap<Action, Rule>>([
  [
    "running",
    new Map<Action, Rule>([
      ["text", queue("queueTextWhileRunning", "running 时继续发文字进入消息队列。")],
      ["goal", queue("queueGoalWhileRunning", "running 时设置 goal 进入消息队列。")],
      ["compact", queue("runningCompactQueues", "running 时 compact 作为维护意图进入 FIFO。")],
      ["fork", deny("runningCannotFork", "运行中不能 fork", "最新轮次和老轮次都不能 fork。")],
      [
        "edit",
        deny(
          "runningCannotEditQuery",
          "运行中不能编辑 query",
          "发送过程中最新 query 和历史 query 都不能编辑。",
        ),
      ],
    ]),
  ],
  [
    "compacting",
    new Map<Action, Rule>([
      [
        "compact",
        deny("compactingCannotCompact", "正在 compact，不能再次 compact", "必须去重或禁用入口。"),
      ],
      [
        "text",
        queue("compactingAcceptsFutureInput", "compacting 时输入追加 queue，不打断 compact。"),
      ],
      [
        "goal",
        queue("compactingAcceptsFutureInput", "compacting 时输入追加 queue，不打断 compact。"),
      ],
      [
        "fork",
        deny("compactingCannotFork", "正在 compact，不能 fork", "避免 fork 到半压缩上下文。"),
      ],
    ]),
  ],
  [
    "goalVerifying",
    new Map<Action, Rule>([
      [
        "compact",
        queue(
          "goalVerifierAcceptsFutureInput",
          "goal verifier 中 compact 追加 queue，不打断验证。",
        ),
      ],
      [
        "text",
        queue("goalVerifierAcceptsFutureInput", "goal verifier 中输入追加 queue，不打断验证。"),
      ],
      [
        "goal",
        queue("goalVerifierAcceptsFutureInput", "goal verifier 中输入追加 queue，不打断验证。"),
      ],
      [
        "fork",
        deny("goalVerifyingCannotFork", "goal 验证中不能 fork", "验证阶段 fork 会破坏结果归属。"),
      ],
    ]),
  ],
  [
    "completed",
    new Map<Action, Rule>([
      [
        "fork",
        allow("completedCanFork", "完成后可以 fork", (context, candidate) => ({
          ...context,
          forked: true,
          selectedTurn: candidate.target,
        })),
      ],
      [
        "compact",
        (context) => {
          if (context.queue !== "empty")
            return queue("heldCompactQueues", "held queue 下 compact 追加队尾，不绕过未来意图。");
          if (context.compactMemory === "justCompacted" && !context.canCompactAgain) {
            return deny(
              "justCompactedNoNeed",
              "刚压缩完，不需要压缩",
              "compact 可以被点击，但模型返回 noop 提示。",
            );
          }
          return allow("completedCanCompact", "完成后可以 compact", (value) => ({
            ...value,
            runPhase: "compacting",
            compactMemory: "compactable",
          }));
        },
      ],
      [
        "text",
        (context) =>
          context.queue !== "empty"
            ? choice(
                "held queue 下发送需用户裁决",
                "呈现「清空 queue 后发送 / 保留 queue 立即发送」，disposition 随 command 上行。",
              )
            : allow("completedCanSend", "完成后继续发送", send),
      ],
      [
        "goal",
        (context) =>
          context.queue !== "empty"
            ? choice(
                "held queue 下设置 goal 需用户裁决",
                "同 sendText：composer 输入统一走 choice。",
              )
            : allow("completedCanSetGoal", "完成后可以设置 goal", activateGoal),
      ],
    ]),
  ],
  [
    "idle",
    new Map<Action, Rule>([
      ["text", allow("idleCanSend", "idle 时发送消息", send)],
      ["goal", allow("idleCanSetGoal", "idle 时设置 goal", activateGoal)],
      [
        "compact",
        deny("idleCannotCompact", "没有可压缩上下文", "没有完成消息时 compact 应禁用或提示。"),
      ],
      ["fork", deny("idleCannotFork", "没有可 fork 轮次", "没有完成轮次时 fork 应禁用。")],
      ["edit", deny("idleCannotEdit", "没有可编辑 query", "没有 query 时编辑入口不应该出现。")],
    ]),
  ],
]);

interface SystemEvent {
  readonly ruleId: string;
  readonly title: string;
  readonly applicable: (context: ProductContext) => boolean;
  readonly next: (context: ProductContext) => ProductContext;
}
const systemEvents = new Map<string, SystemEvent>([
  [
    "assistantComplete",
    {
      ruleId: "assistantComplete",
      title: "assistant 完成",
      applicable: (context) => context.runPhase === "running",
      next: drain,
    },
  ],
  [
    "compactComplete",
    {
      ruleId: "compactComplete",
      title: "compact 完成",
      applicable: (context) => context.runPhase === "compacting",
      next: (context) => ({
        ...context,
        runPhase: "completed",
        compactMemory: "justCompacted",
        canCompactAgain: true,
      }),
    },
  ],
  [
    "compactNoop",
    {
      ruleId: "compactNoop",
      title: "compact 判断无需继续",
      applicable: (context) => context.runPhase === "compacting",
      next: (context) => ({
        ...context,
        runPhase: "completed",
        compactMemory: "justCompacted",
        canCompactAgain: false,
      }),
    },
  ],
  [
    "goalVerifyStart",
    {
      ruleId: "goalVerifyStart",
      title: "进入 goal 验证",
      applicable: (context) => context.runPhase === "completed" && context.goal === "active",
      next: (context) => ({ ...context, runPhase: "goalVerifying", goal: "verifying" }),
    },
  ],
  [
    "goalVerifyPass",
    {
      ruleId: "goalVerifyPass",
      title: "goal 验证通过",
      applicable: (context) => context.runPhase === "goalVerifying",
      next: (context) => ({ ...context, runPhase: "completed", goal: "verified" }),
    },
  ],
  [
    "goalVerifyFail",
    {
      ruleId: "goalVerifyFail",
      title: "goal 验证失败",
      applicable: (context) => context.runPhase === "goalVerifying",
      next: (context) => ({ ...context, runPhase: "completed", goal: "failed" }),
    },
  ],
]);

export function isSystemCandidateApplicable(
  context: ProductContext,
  candidate: Candidate,
): boolean {
  return systemEvents.get(candidate.id)?.applicable(context) ?? false;
}

function drain(context: ProductContext): ProductContext {
  const transitions = new Map<QueueState, Partial<ProductContext>>([
    ["text", { runPhase: "running", queue: "empty" }],
    ["goal", { runPhase: "completed", queue: "empty", goal: "active" }],
    ["compact", { runPhase: "compacting", queue: "empty" }],
    ["mixed", { runPhase: "running", queue: "goal" }],
  ]);
  const change = transitions.get(context.queue);
  return change
    ? { ...context, ...change }
    : {
        ...context,
        runPhase: "completed",
        compactMemory: context.compactMemory === "never" ? "compactable" : context.compactMemory,
      };
}

function queuedDecision(context: ProductContext, candidate: Candidate, recipe: Recipe): Decision {
  const item =
    candidate.id === "setGoal"
      ? "goal"
      : ["compact", "slashCompact"].includes(candidate.id)
        ? "compact"
        : "text";
  const merged = context.queue === "empty" || context.queue === item ? item : "mixed";
  const text = {
    goal: ["goal 入队", "队列里必须保留 goal 意图。"],
    compact: ["compact 入队", "队列里必须保留 compact 维护意图，且不能生成 user row。"],
    text: ["文字消息入队", "队列里必须保留用户文字消息。"],
  }[item];
  return {
    kind: "enqueue",
    ruleId: recipe.ruleId,
    title: text[0]!,
    reason: recipe.reason!,
    next: { ...context, queue: merged },
    assertion: text[1]!,
  };
}

/** Public product verdict; CLI/bootstrap consumers continue to use this entry. */
export function evaluate(context: ProductContext, candidate: Candidate): Decision {
  if (candidate.kind === "system") {
    const event = systemEvents.get(candidate.id) ?? systemEvents.get("goalVerifyFail")!;
    return {
      kind: "system",
      ruleId: event.ruleId,
      title: event.title,
      reason: "系统异步事件推进产品状态。",
      next: event.next(context),
      assertion: "系统事件必须按当前 session/run 归属落盘，不能污染其它 trace。",
    };
  }
  const phase = phases.has(context.runPhase) ? context.runPhase : "idle";
  const action = actionIds.get(candidate.id);
  const rule = action && phases.get(phase)!.get(action);
  if (!rule)
    return {
      kind: "undefined",
      ruleId: `${phase}Unhandled`,
      title: "产品预期未定义",
      reason: `模型还不知道 ${context.runPhase} + ${candidate.label} 应该 allow、reject 还是 enqueue。`,
      assertion: "需要人工 review：补产品规则、剪枝为 invalid、或标记可忽略。",
    };
  const recipe = typeof rule === "function" ? rule(context) : rule;
  if (recipe.kind === "enqueue") return queuedDecision(context, candidate, recipe);
  if (recipe.kind === "reject")
    return {
      kind: "reject",
      ruleId: recipe.ruleId,
      title: recipe.title,
      reason: recipe.reason!,
      assertion: "这条路径必须显示明确反馈，并且不能产生被禁止的副作用。",
      next: context,
    };
  if (recipe.kind === "choice")
    return {
      kind: "choice",
      ruleId: recipe.ruleId,
      title: recipe.title,
      reason: recipe.reason!,
      next: context,
      assertion: "必须呈现明确选择，用户裁决前不得入队、不得发送。",
    };
  return {
    kind: "allow",
    ruleId: recipe.ruleId,
    title: recipe.title,
    reason: recipe.title,
    next: recipe.next!(context, candidate),
    assertion: "动作应生效，并且 UI、消息归属、按钮状态与下一上下文一致。",
  };
}
