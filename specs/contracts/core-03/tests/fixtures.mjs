// SPDX-License-Identifier: Apache-2.0
// core-03 契约测试夹具：合成快照与注入式依赖。全部为合成数据，不含真实用户数据或凭据。
// 快照经 contracts 的 zod schema 解析构造（字段缺省由 schema 补齐），因此始终满足契约。
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./entry.mjs";

const contractsEntry = pathToFileURL(
  resolve(repoRoot, "apps/cli/packages/contracts/dist/index.js"),
).href;
export const contracts = await import(contractsEntry);

const ISO = "2026-01-01T00:00:00.000Z";

/** 合法的最小运行快照（strategy 用内置默认策略，保证 schema 通过）。 */
export function makeSnapshot(options = {}) {
  const strategy = options.strategy ?? strategyFromCore();
  const parsed = contracts.WorkflowRunSnapshotSchema.parse({
    artifacts: [],
    createdAt: ISO,
    cwd: options.cwd ?? "/work",
    graph: {
      collections: options.collections ?? [],
      edges: options.edges ?? [],
      nodes: (options.nodes ?? []).map((node) => makeNode(node)),
    },
    kind: "expert_workflow",
    phaseOrder: options.phaseOrder ?? [],
    phases: options.phases ?? [],
    runId: options.runId ?? "run-1",
    schemaVersion: 1,
    status: options.status ?? "running",
    strategy,
    task: options.task ?? "contract test task",
    updatedAt: ISO,
  });
  return parsed;
}

/** 单个图节点（id + kind 为必需字段）。 */
export function makeNode(input) {
  const parsed = contracts.WorkflowGraphNodeSchema.parse({
    id: input.id,
    kind: input.kind ?? "task",
    status: input.status ?? "pending",
    title: input.title ?? input.id,
    ...(input.dependsOn ? { dependsOn: input.dependsOn } : {}),
    ...(input.collectionId ? { collectionId: input.collectionId } : {}),
  });
  return parsed;
}

let cachedStrategy;
function strategyFromCore() {
  if (cachedStrategy) return cachedStrategy;
  // 内置默认策略来自本包实现（惰性加载，避免夹具与实现在模块初始化期耦合）。
  cachedStrategy = globalThis.__core03DefaultStrategy ?? undefined;
  if (!cachedStrategy) throw new Error("call primeStrategy(core) before makeSnapshot()");
  return cachedStrategy;
}

/** 测试在加载包根后调用一次，把默认策略交给夹具。 */
export function primeStrategy(core) {
  globalThis.__core03DefaultStrategy = core.DEFAULT_EXPERT_WORKFLOW_STRATEGY;
}

/**
 * 注入式调度依赖：事件与快照写入被记录，runner 行为可切换。
 * `runnerBehavior` 返回 "ok" | "throw" | "pending" 决定节点执行结果。
 */
export function makeSchedulerDeps(options = {}) {
  const events = [];
  const appended = [];
  const snapshotWrites = [];
  const artifacts = [];
  let activitySeq = 0;
  const behavior = options.runnerBehavior ?? (() => "ok");
  const runner = {
    async run(input) {
      const mode = behavior(input);
      if (mode === "throw") throw new Error(`node failed: ${input.node.id}`);
      return {
        response: `done:${input.node.id}`,
        sessionId: `session-${input.node.id}`,
        traceId: input.traceContext?.traceId,
        turnId: `turn-${input.activityId}`,
      };
    },
  };
  return {
    appended,
    artifacts,
    deps: {
      appendEvent: async (event) => {
        appended.push(event);
      },
      appendGraphRecord: async (runId, record) => {
        appended.push({ record, runId });
      },
      createActivityId: () => {
        activitySeq += 1;
        return `activity-${activitySeq}`;
      },
      now: () => new Date(ISO),
      onWorkflowEvent: (event) => {
        events.push(event);
      },
      runner,
      writeArtifact: async (runId, relativePath, content) => {
        artifacts.push({ content, relativePath, runId });
        return { path: `/artifacts/${relativePath}`, relativePath };
      },
      writeSnapshot: async (snapshot) => {
        snapshotWrites.push(snapshot);
      },
    },
    events,
    snapshotWrites,
  };
}

/** 常用断言辅助：从事件数组里取某一类事件名。 */
export function eventNames(list) {
  return list.map((entry) => entry?.type ?? entry?.event ?? entry?.name ?? "unknown");
}
