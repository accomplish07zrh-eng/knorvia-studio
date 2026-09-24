import type { StudioGroupDefinition, StudioRun, StudioWorkflowNodeKind } from "@knorvia/services";
import { isStudioKernelId, studioKernelOption } from "../types.js";

function count(value: string): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number < Number.MAX_SAFE_INTEGER
    ? number
    : undefined;
}

function attemptLabel(label: string, attempt: number, zh: boolean): string {
  return attempt > 0
    ? `${label} · ${zh ? `第 ${attempt + 1} 次尝试` : `Attempt ${attempt + 1}`}`
    : label;
}

function memberName(group: StudioGroupDefinition, id: unknown): string | undefined {
  return isStudioKernelId(id) && group.members.some((member) => member === id)
    ? studioKernelOption(id).name
    : undefined;
}

function groupTaskLabel(
  run: StudioRun,
  group: StudioGroupDefinition,
  round: number,
  id: string,
  zh: boolean,
) {
  const plan = run.checkpoint.plan;
  if (
    !plan ||
    typeof plan !== "object" ||
    !("version" in plan) ||
    plan.version !== 1 ||
    !("round" in plan) ||
    plan.round !== round ||
    !("tasks" in plan) ||
    !Array.isArray(plan.tasks)
  )
    return undefined;
  const task: unknown = plan.tasks.find(
    (item: unknown) => item && typeof item === "object" && "id" in item && item.id === id,
  );
  if (!task || typeof task !== "object" || !("member" in task)) return undefined;
  const member = memberName(group, task.member);
  if (!member) return undefined;
  const instruction =
    "instruction" in task && typeof task.instruction === "string"
      ? task.instruction.replace(/\s+/g, " ").trim()
      : "";
  const title = instruction.length > 80 ? `${instruction.slice(0, 80)}…` : instruction;
  return title ? `${member} · ${title}` : `${member} ${zh ? "任务" : "task"}`;
}

/** Labels use the frozen run definition; internal step IDs remain untouched for all commands. */
export function studioRunStepLabel(run: StudioRun, stepId: string, locale: string): string {
  const zh = locale.startsWith("zh");
  const definition = run.definition;
  if (run.kind === "workflow") {
    const match = /^workflow:(.+):attempt:(\d+)$/.exec(stepId);
    const attempt = match ? count(match[2]!) : undefined;
    const node =
      match && definition && "nodes" in definition
        ? definition.nodes.find((candidate) => candidate.id === match[1])
        : undefined;
    if (!node || attempt === undefined) return zh ? "工作流步骤" : "Workflow step";
    const kinds: Record<StudioWorkflowNodeKind, string> = zh
      ? {
          start: "开始",
          agent: "Agent 任务",
          creation: "创作",
          condition: "条件判断",
          parallel: "并行任务",
          join: "汇合",
          approval: "人工确认",
          end: "结束",
        }
      : {
          start: "Start",
          agent: "Agent task",
          creation: "Create media",
          condition: "Condition",
          parallel: "Parallel tasks",
          join: "Join",
          approval: "Approval",
          end: "Finish",
        };
    return attemptLabel(
      node.data.label.trim() || kinds[node.data.kind] || (zh ? "工作流步骤" : "Workflow step"),
      attempt,
      zh,
    );
  }
  if (run.kind === "group") {
    if (!definition || !("members" in definition)) return zh ? "群聊步骤" : "Group step";
    const manual = /^group:manual:(.+)$/.exec(stepId);
    const member = manual ? memberName(definition, manual[1]) : undefined;
    if (member) return `${member} ${zh ? "回复" : "reply"}`;
    const host = /^group:(plan|review|steering):(\d+):response:(\d+)$/.exec(stepId);
    if (host) {
      const round = count(host[2]!);
      const response = count(host[3]!);
      const name = memberName(definition, definition.host);
      if (round !== undefined && response !== undefined && name) {
        const phase =
          host[1] === "plan"
            ? zh
              ? "安排任务"
              : "Task planning"
            : host[1] === "review"
              ? zh
                ? "复核结果"
                : "Review results"
              : zh
                ? "调整任务"
                : "Adjust tasks";
        const suffix =
          host[1] === "review" && round > 0
            ? ` · ${zh ? `第 ${round + 1} 轮` : `Round ${round + 1}`}`
            : "";
        return attemptLabel(`${name} · ${phase}${suffix}`, response, zh);
      }
    }
    const task = /^group:round:(\d+):task:(.+)$/.exec(stepId);
    const round = task ? count(task[1]!) : undefined;
    if (task && round !== undefined) {
      const name =
        groupTaskLabel(run, definition, round, task[2]!, zh) ?? (zh ? "群聊任务" : "Group task");
      return `${name} · ${zh ? `第 ${round + 1} 轮` : `Round ${round + 1}`}`;
    }
    return zh ? "群聊步骤" : "Group step";
  }
  return stepId === "reply" ? (zh ? "回复" : "Reply") : zh ? "对话步骤" : "Chat step";
}
