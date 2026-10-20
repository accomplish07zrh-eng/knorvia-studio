// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 B8/B9/B15：固定组合快照、无 Hook 兼容层、无遥测。
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadKernel } from "./entry.mjs";
import { withBoot } from "./_kernel.mjs";
import { makeTempDir, removeTempDir } from "./_process.mjs";

const EXPECTED_IDS = [
  "timer",
  "llm",
  "sessions",
  "session-persistence",
  "session-projection",
  "system-prompt",
  "tools",
  "agents",
  "agent-loop",
  "invariants",
  "session-invariant",
  "agent-invariant",
  "scope-invariant",
  "agent-loop-invariant",
  "agent-instructions",
  "skill",
  "skill-filesystem",
  "mcp-resources",
  "llm-pi-ai",
];

function expectedRows(dshHome, personaPrefix) {
  return [
    { id: "timer", name: "@deepseek-ai/cordis-plugin-timer" },
    { id: "llm", name: "@deepseek-ai/dsh-llm" },
    { id: "sessions", name: "@deepseek-ai/dsh-session" },
    {
      id: "session-persistence",
      name: "@deepseek-ai/dsh-session-persistence-jsonl",
      config: { root: join(dshHome, "sessions"), compression: "none" },
    },
    { id: "session-projection", name: "@deepseek-ai/dsh-session-projection" },
    {
      id: "system-prompt",
      name: "@deepseek-ai/dsh-system-prompt",
      config: {
        includeHarnessIdentity: false,
        // kernel-dsh-builtins B14：运行环境信息（目录/平台/shell/日期/时区）是模型
        // 判断工作环境的前提，该行由 false 改为 true（kernel-dsh-builtins D2）。
        includeRuntimeContext: true,
        personaPrefix,
      },
    },
    { id: "tools", name: "@deepseek-ai/dsh-tools" },
    { id: "agents", name: "@deepseek-ai/dsh-agent" },
    { id: "agent-loop", name: "@deepseek-ai/dsh-agent-loop", config: { agents: [] } },
    { id: "invariants", name: "@deepseek-ai/dsh-invariants" },
    { id: "session-invariant", name: "@deepseek-ai/dsh-session/invariant" },
    { id: "agent-invariant", name: "@deepseek-ai/dsh-agent/invariant" },
    { id: "scope-invariant", name: "@deepseek-ai/dsh-scope/invariant" },
    { id: "agent-loop-invariant", name: "@deepseek-ai/dsh-agent-loop/invariant" },
    {
      id: "agent-instructions",
      name: "@deepseek-ai/dsh-agent-instructions",
      config: { maxBytes: 65536 },
    },
    { id: "skill", name: "@deepseek-ai/dsh-skill" },
    {
      id: "skill-filesystem",
      name: "@deepseek-ai/dsh-skill-filesystem",
      config: { includeDefaultRoots: false, watch: false },
    },
    { id: "mcp-resources", name: "@deepseek-ai/dsh-mcp-resources" },
    { id: "llm-pi-ai", name: "@deepseek-ai/dsh-llm-pi-ai", config: { providers: {} } },
  ];
}

test("B15 组合蓝图与物化结果和 README §三 的 19 行底座完全一致", async () => {
  const kernel = await loadKernel();
  assert.equal(kernel.KERNEL_DSH_VERSION, "0.2.0-rc.2");
  assert.deepEqual(
    kernel.KERNEL_PLUGIN_ROWS.map((row) => row.id),
    EXPECTED_IDS,
  );
  const dshHome = join(tmpdir(), "kernel-dsh-snapshot-home");
  const before = structuredClone(kernel.KERNEL_PLUGIN_ROWS);
  const rows = kernel.createKernelPluginRows(dshHome);
  // kernel-dsh-builtins 在本行之后追加自己的行（known-differences D1）。底座部分
  // 必须逐字段一致；追加行的 id 与顺序由该包合同的 composition-builtins 用例断言。
  assert.deepEqual(
    rows.slice(0, EXPECTED_IDS.length),
    expectedRows(dshHome, kernel.KERNEL_PERSONA_PREFIX),
    "底座 19 行必须与快照逐字段一致",
  );
  const appended = rows.slice(EXPECTED_IDS.length);
  assert.ok(appended.length > 0, "物化结果必须含 kernel-dsh-builtins 追加行");
  const appendedIds = appended.map((row) => row.id);
  assert.equal(new Set(appendedIds).size, appendedIds.length, "追加行 id 不得重复");
  for (const id of appendedIds) {
    assert.equal(EXPECTED_IDS.includes(id), false, `追加行 id 不得与底座重名：${id}`);
  }
  assert.deepEqual(kernel.KERNEL_PLUGIN_ROWS, before, "生成 entry 不得修改蓝图");
});

test("B8/B9 组合不含 Hook 兼容层与遥测行，boot 后无对应服务", async () => {
  const kernel = await loadKernel();
  const names = kernel.KERNEL_PLUGIN_ROWS.map((row) => row.name);
  for (const name of names) {
    assert.equal(/dsh-hooks-(?:claude-code|codex)/u.test(name), false, name);
    assert.equal(/dsh-otel|session-telemetry-otel/u.test(name), false, name);
  }
  assert.equal(
    names.some((name) => /credentials-local|shell-env/u.test(name)),
    false,
  );

  const root = await makeTempDir("kernel-dsh-composition-");
  try {
    await withBoot(kernel, { root }, async ({ host }) => {
      assert.equal(host.context.get("hooks"), undefined);
      assert.equal(host.context.get("telemetry"), undefined);
      assert.equal(process.env.DSH_TELEMETRY_DISABLED, "1");
    });
  } finally {
    await removeTempDir(root);
  }
});
