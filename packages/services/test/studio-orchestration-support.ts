import type { StudioAgentStep, StudioExecutionPort } from "../src/studio-runtime/app/ports.js";
import type {
  StudioCheckpoint,
  StudioGroupDefinition,
  StudioStepResult,
  StudioWorkflowDefinition,
  StudioWorkflowNodeKind,
} from "../src/studio-runtime/workflowTypes.js";

export const success = (text: string): StudioStepResult => ({
  status: "succeeded",
  text,
  resultKnown: true,
});
export const failure = (text: string): StudioStepResult => ({
  status: "failed",
  text: "",
  error: text,
  resultKnown: true,
});
export const group: StudioGroupDefinition = {
  id: "team",
  name: "Team",
  goal: "Review",
  members: ["knorvia", "codex", "claude-code"],
  host: "knorvia",
  sharedSummary: "Only shared context",
  mode: "manual",
  workspaceMode: "isolated",
  createdAt: 1,
  updatedAt: 1,
};
export function workflow(
  kinds: StudioWorkflowNodeKind[],
  links: Array<[number, number, string?]>,
): StudioWorkflowDefinition {
  return {
    id: "graph",
    name: "Graph",
    workspacePath: "/project",
    updatedAt: 1,
    nodes: kinds.map((kind, i) => ({
      id: `n${i}`,
      position: { x: 0, y: 0 },
      data: {
        kind,
        label: `Node ${i}`,
        kernel: "codex",
        prompt: `Task ${i}`,
        condition: 'input equals "yes"',
        retryCount: 0,
        retryDelay: 0,
        joinPolicy: "all",
      },
    })),
    edges: links.map(([source, target, sourceHandle], i) => ({
      id: `e${i}`,
      source: `n${source}`,
      target: `n${target}`,
      sourceHandle,
    })),
  };
}
export function harness(
  run: (step: StudioAgentStep) => Promise<StudioStepResult> = async (step) => success(step.id),
) {
  const controller = new AbortController();
  let checkpoint: StudioCheckpoint = { steps: {}, values: {}, completedRounds: 0 };
  const calls: StudioAgentStep[] = [];
  const questions = new Map<string, boolean>();
  const port: StudioExecutionPort = {
    signal: controller.signal,
    attempt: 0,
    get checkpoint() {
      return checkpoint;
    },
    async saveCheckpoint(update) {
      checkpoint = {
        ...checkpoint,
        ...update,
        steps: checkpoint.steps,
        values: { ...checkpoint.values, ...update.values },
      };
    },
    async agent(step) {
      if (checkpoint.steps[step.id]) return checkpoint.steps[step.id]!;
      calls.push(step);
      const result = await run(step);
      checkpoint.steps[step.id] = result;
      return result;
    },
    async confirm(id) {
      questions.set(id, true);
      return true;
    },
    async progress() {},
    async delay(_ms, signal) {
      if (signal?.aborted || controller.signal.aborted) throw new Error("aborted");
    },
    now: () => 1000,
  };
  return { port, calls, controller, questions };
}
