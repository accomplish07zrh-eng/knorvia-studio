// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同测试夹具构造器：全部为合成数据，不含真实用户数据、凭据或内部地址。
// `@knorvia/contracts` 按它自己的 dist 入口导入（契约测试目录不属于任何 workspace 包，
// 根 node_modules 没有该依赖的链接；dist 由 `pnpm build:cli-packages` 生成）。
import { fileURLToPath, pathToFileURL } from "node:url";

const contractsEntry = fileURLToPath(
  new URL("../../../../apps/cli/packages/contracts/dist/index.js", import.meta.url),
);
const { createWorkspaceHookBundleSnapshot } = await import(pathToFileURL(contractsEntry).href);

export const digest = (seed, length = 64) => {
  const hex = "0123456789abcdef";
  let out = "";
  for (let index = 0; out.length < length; index++) {
    out += hex[(seed.charCodeAt(index % seed.length) + index) % hex.length];
  }
  return out;
};

export const WORKSPACE_IDENTITY = "workspace://fixture/alpha";
export const BUNDLE_DIGEST = digest("bundle");
export const DECLARATION_DIGEST = digest("declaration");

/** 最小可信快照：一个可编辑的 process 类型 Hook。 */
export function makeSnapshot(overrides = {}) {
  const entryOverrides = Object.fromEntries(
    Object.entries(overrides.entry ?? {}).filter(([, value]) => value !== undefined),
  );
  const entry = {
    reviewItemId: "item-1",
    event: "PreToolUse",
    matcherIndex: 0,
    hookIndex: 0,
    sourceFileIndex: 0,
    sourceRelativePath: ".knorvia-studio/config.json",
    matcher: "Bash",
    command: "node",
    args: ["hook.mjs"],
    type: "process",
    resolvedTimeoutMs: 5000,
    resolvedMaxOutputBytes: 65536,
    sourceRootEnabled: true,
    declarationEnabled: true,
    runtimeHooksEnabled: true,
    configuredEnabled: true,
    editable: true,
    declarationDigestAlgorithm: "sha256",
    hookDeclarationDigest: DECLARATION_DIGEST,
    ...entryOverrides,
  };
  if (entryOverrides.type === "command") delete entry.args;
  return createWorkspaceHookBundleSnapshot({
    schemaVersion: 1,
    workspaceIdentity: overrides.workspaceIdentity ?? WORKSPACE_IDENTITY,
    discoveredAt: "2026-01-01T00:00:00.000Z",
    sourceFiles: [
      {
        canonicalPath: "/tmp/fixture/.knorvia-studio/config.json",
        baseDir: "/tmp/fixture",
        discoveryOrder: 0,
        configFileKind: ".knorvia-studio/config.json",
        explicitProjectConfig: false,
        editable: true,
        hooksRoot: {},
      },
    ],
    hooks: [entry],
    digestAlgorithm: "sha256",
    bundleDigest: overrides.bundleDigest ?? BUNDLE_DIGEST,
  });
}

/** 审核请求载荷（满足 workspaceHookReviewRequestPayloadSchema 的全部一致性约束）。 */
export function makeReviewRequest(overrides = {}) {
  const createdAt = overrides.createdAt ?? Date.now();
  const deadlineAt = overrides.deadlineAt ?? createdAt + 60_000;
  const items = overrides.items ?? [
    {
      reviewItemId: "item-1",
      event: "PreToolUse",
      type: "process",
      displayName: "fixture hook",
      displayCommand: "node hook.mjs",
      sourcePath: ".knorvia-studio/config.json",
      resolvedTimeoutMs: 5000,
      resolvedMaxOutputBytes: 65536,
      executionMode: "foreground",
      configuredEnabled: true,
      editable: true,
      trustState: "pending_trust",
    },
  ];
  return {
    kind: "workspaceHookReview",
    reviewFlowId: overrides.reviewFlowId ?? "flow-1",
    generation: overrides.generation ?? 1,
    interactionId: overrides.interactionId ?? "interaction-1",
    sessionId: overrides.sessionId ?? "session-1",
    taskId: overrides.taskId ?? "task-1",
    runId: overrides.runId ?? "run-1",
    workspaceIdentity: overrides.workspaceIdentity ?? WORKSPACE_IDENTITY,
    workspaceLabel: "fixture",
    ...(overrides.remoteSessionId ? { remoteSessionId: overrides.remoteSessionId } : {}),
    bundleDigest: overrides.bundleDigest ?? BUNDLE_DIGEST,
    createdAt,
    deadlineAt,
    sourceFiles: [
      {
        path: ".knorvia-studio/config.json",
        displayPath: ".knorvia-studio/config.json",
        editable: true,
      },
    ],
    summary: {
      eventCount: new Set(items.map((item) => item.event)).size,
      hookCount: items.length,
      pendingCount: items.filter((item) =>
        ["pending_trust", "revoked", "stale_digest"].includes(item.trustState),
      ).length,
    },
    items,
    warningCode: "workspace_hooks_execute_code",
  };
}

/** 审核命令 target（与请求保持一致）。 */
export function makeReviewTarget(overrides = {}) {
  return {
    sessionId: overrides.sessionId ?? "session-1",
    taskId: overrides.taskId ?? "task-1",
    runId: overrides.runId ?? "run-1",
    ...(overrides.remoteSessionId ? { remoteSessionId: overrides.remoteSessionId } : {}),
    workspaceIdentity: overrides.workspaceIdentity ?? WORKSPACE_IDENTITY,
    bundleDigest: overrides.bundleDigest ?? BUNDLE_DIGEST,
    reviewFlowId: overrides.reviewFlowId ?? "flow-1",
    generation: overrides.generation ?? 1,
    interactionId: overrides.interactionId ?? "interaction-1",
  };
}

/** `HookInput` 的最小合成输入（只带被测行为需要的字段）。 */
export function makeHookInput(overrides = {}) {
  return {
    agentName: "fixture-agent",
    cwd: "/tmp/fixture",
    hookEventName: "PreToolUse",
    mode: "default",
    sessionId: "session-1",
    traceId: "trace-1",
    turnId: "turn-1",
    hookEventNameAlias: undefined,
    ...overrides,
  };
}

/** 记录调用的假 ExecutionPort。 */
export function makeExecutionPort(results = []) {
  const calls = [];
  const queue = [...results];
  return {
    calls,
    async run(request, options) {
      calls.push({ request, options });
      const next = queue.shift();
      if (typeof next === "function") return next(request, options);
      return (
        next ?? {
          status: "completed",
          exitCode: 0,
          stdout: { text: "" },
          stderr: { text: "" },
        }
      );
    },
  };
}

/** 记录日志条目的假 Logger。 */
export function makeLogger() {
  const entries = [];
  return {
    entries,
    info(message, fields) {
      entries.push({ level: "info", message, fields });
    },
    warn(message, fields) {
      entries.push({ level: "warn", message, fields });
    },
    error(message, fields) {
      entries.push({ level: "error", message, fields });
    },
    debug(message, fields) {
      entries.push({ level: "debug", message, fields });
    },
  };
}

/** 记录 drain 调用的假 SessionMailboxPort。 */
export function makeMailbox(messages = []) {
  const calls = [];
  return {
    calls,
    async drainUnread(input, options) {
      calls.push({ input, options });
      return messages;
    },
  };
}

/** 最小 HookConfig。 */
export function makeHookConfig(overrides = {}) {
  return {
    type: "process",
    command: "node",
    args: ["hook.mjs"],
    ...overrides,
  };
}
