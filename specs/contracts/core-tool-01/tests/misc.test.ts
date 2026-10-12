// SPDX-License-Identifier: Apache-2.0
// core-tool-01 contract tests, part 3: memory-file permission, external background
// tracking and the package entry surface.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyMemoryFilePermission,
  targetsMemoryFile,
} from "../../../../apps/cli/packages/core/src/tool/executor/memory-file-permission.js";
import { createToolExecutor } from "../../../../apps/cli/packages/core/src/tool/executor/impl.js";
import {
  builtInTools,
  createToolExecutor as entryExecutor,
} from "../../../../apps/cli/packages/core/src/tool/index.js";
import { ToolExecutorImpl } from "../../../../apps/cli/packages/core/src/tool/executor.js";

const memoryRoot = "/home/u/.knorvia-studio/memory";
const base = { memoryRoot, workingDirectory: "/home/u/project", workspaceRoot: "/home/u/project" };

test("B19 targetsMemoryFile only for Write/Edit with an in-root .md path", () => {
  assert.equal(
    targetsMemoryFile({
      ...base,
      toolName: "Read",
      executionInput: { file_path: `${memoryRoot}/a.md` },
    }),
    false,
  );
  assert.equal(
    targetsMemoryFile({ ...base, toolName: "Write", executionInput: { file_path: "" } }),
    false,
  );
  assert.equal(
    targetsMemoryFile({ ...base, toolName: "Write", executionInput: { file_path: 1 } }),
    false,
  );
  assert.equal(
    targetsMemoryFile({
      ...base,
      toolName: "Write",
      executionInput: { file_path: `${memoryRoot}/a.md` },
      memoryRoot: undefined,
    }),
    false,
  );
  assert.equal(
    targetsMemoryFile({
      ...base,
      toolName: "Write",
      executionInput: { file_path: "../outside.md" },
    }),
    false,
  );
  assert.equal(
    targetsMemoryFile({
      ...base,
      toolName: "Edit",
      executionInput: { file_path: `${memoryRoot}/a.md` },
    }),
    true,
  );
});

test("B20 applyMemoryFilePermission rewrites only an overridable decision", () => {
  const target = {
    ...base,
    toolName: "Write",
    executionInput: { file_path: `${memoryRoot}/a.md` },
  };
  const planDeny = { allowed: false, decision: "deny", ruleId: "mode.plan.nonReadOnly" } as never;
  const planDenied = applyMemoryFilePermission({ ...target, decision: planDeny });
  assert.equal(planDenied.allowed, true);
  assert.equal(planDenied.ruleId, "memory.file.markdown");
  assert.equal(planDenied.reason, "Memory Markdown writes are allowed");

  const otherDeny = { allowed: false, decision: "deny", ruleId: "rule.project.deny" } as never;
  assert.equal(applyMemoryFilePermission({ ...target, decision: otherDeny }), otherDeny);

  const hookAsk = { allowed: false, decision: "ask", ruleId: "hook.PreToolUse.ask" } as never;
  assert.equal(applyMemoryFilePermission({ ...target, decision: hookAsk }), hookAsk);

  const alwaysAsk = { allowed: false, decision: "allow", alwaysAsk: true } as never;
  assert.equal(applyMemoryFilePermission({ ...target, decision: alwaysAsk }), alwaysAsk);

  const notMarkdown = { ...target, executionInput: { file_path: `${memoryRoot}/a.txt` } };
  assert.equal(applyMemoryFilePermission({ ...notMarkdown, decision: planDeny }), planDeny);
});

test("B4 trackExternalBackgroundTask shares the submit path tracker", async () => {
  const events: Record<string, any>[] = [];
  const executor = createToolExecutor({
    registry: {} as never,
    permissionService: {} as never,
    emitEvent: async (event: Record<string, any>) => void events.push(event),
    sessionId: "s1",
  } as never);
  const call = { id: "call-1", name: "Bash", input: { command: "x" } } as never;
  await executor.trackExternalBackgroundTask(
    call,
    { status: "backgrounded", backgroundTaskId: "t1" },
    { traceId: "tr" } as never,
    undefined,
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["background_task_started", "background_task_completed"],
  );
  assert.equal(events[1]!.payload.status, "lost");
  await executor.trackExternalBackgroundTask(
    call,
    { status: "backgrounded", backgroundTaskId: "t1" },
    { traceId: "tr" } as never,
    undefined,
  );
  assert.equal(events.length, 4);
});

test("B59 the package entry keeps the documented re-export surface", () => {
  assert.equal(typeof entryExecutor, "function");
  assert.equal(typeof createToolExecutor, "function");
  assert.equal(typeof ToolExecutorImpl, "function");
  assert.ok(builtInTools !== undefined);
  assert.equal(entryExecutor, createToolExecutor);
});
