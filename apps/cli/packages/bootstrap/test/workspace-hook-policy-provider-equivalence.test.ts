// 等价性验证：workspace hook 策略提供者的内联版与 core 原版，行为必须完全一致。
//
// 这是有状态 + 回调的类，所以三层都要对照：
// ① 方法返回值（getPolicy）
// ② 订阅者收到的变更序列（副作用）
// ③ 变更的「有无」边界（值没变不广播）
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryWorkspaceHookPolicyProvider as CoreProvider } from "../../core/src/hooks/workspace-hook-policy.js";
import { InMemoryWorkspaceHookPolicyProvider as InlineProvider } from "../src/protocol/workspace-hook-policy-provider.js";

/** 两种策略。 */
const USER_DECIDES = { mode: "user_decides", policyRevision: "builtin:user-decides:v1" };
const ALLOW_TRUSTED = { mode: "allow_trusted_only", policyRevision: "custom:allow-trusted:v2" };

/** 跑同一段脚本，收集「返回值 + 订阅序列」。 */
function run(Provider, script) {
  const provider = new Provider();
  const events = [];
  provider.subscribe((change) => {
    events.push(JSON.parse(JSON.stringify(change)));
  });
  const returns = [];
  for (const step of script) {
    returns.push(JSON.parse(JSON.stringify(step(provider))));
  }
  return { returns, events };
}

/** 覆盖各分支的脚本集合。 */
const SCRIPTS = [
  {
    label: "默认策略",
    script: [(p) => p.getPolicy("ws-1")],
  },
  {
    label: "设置 workspace 覆盖后读取",
    script: [(p) => (p.setWorkspacePolicy("ws-1", ALLOW_TRUSTED), p.getPolicy("ws-1"))],
  },
  {
    label: "设置相同值不广播",
    script: [
      (p) => (p.setWorkspacePolicy("ws-1", ALLOW_TRUSTED), p.getPolicy("ws-1")),
      (p) => (p.setWorkspacePolicy("ws-1", ALLOW_TRUSTED), p.getPolicy("ws-1")),
    ],
  },
  {
    label: "清除覆盖回到兜底",
    script: [
      (p) => (p.setWorkspacePolicy("ws-1", ALLOW_TRUSTED), p.getPolicy("ws-1")),
      (p) => (p.clearWorkspacePolicy("ws-1"), p.getPolicy("ws-1")),
    ],
  },
  {
    label: "清除不存在的覆盖不广播",
    script: [(p) => (p.clearWorkspacePolicy("never-set"), p.getPolicy("never-set"))],
  },
  {
    label: "改默认策略影响未覆盖的 workspace",
    script: [
      (p) => (p.setDefaultPolicy(ALLOW_TRUSTED), p.getPolicy("ws-a")),
      (p) => p.getPolicy("ws-b"),
    ],
  },
  {
    label: "改默认策略不影响已覆盖的 workspace",
    script: [
      (p) => (p.setWorkspacePolicy("ws-1", USER_DECIDES), p.getPolicy("ws-1")),
      (p) => (p.setDefaultPolicy(ALLOW_TRUSTED), p.getPolicy("ws-1")),
    ],
  },
  {
    label: "改默认策略为相同值不广播",
    script: [
      (p) => (p.setDefaultPolicy(ALLOW_TRUSTED), p.getPolicy("ws-a")),
      (p) => (p.setDefaultPolicy(ALLOW_TRUSTED), p.getPolicy("ws-a")),
    ],
  },
  {
    label: "多个 workspace 各自独立",
    script: [
      (p) => (p.setWorkspacePolicy("ws-1", ALLOW_TRUSTED), p.getPolicy("ws-1")),
      (p) => (p.setWorkspacePolicy("ws-2", USER_DECIDES), p.getPolicy("ws-2")),
      (p) => p.getPolicy("ws-3"),
    ],
  },
  {
    label: "订阅后取消订阅",
    script: [
      (p) => p.getPolicy("ws-1"),
      (p) => (p.setWorkspacePolicy("ws-1", ALLOW_TRUSTED), p.getPolicy("ws-1")),
    ],
  },
];

for (const { label, script } of SCRIPTS) {
  test(`内联与 core 一致：${label}`, () => {
    const fromCore = run(CoreProvider, script);
    const fromInline = run(InlineProvider, script);
    // ① 返回值序列
    assert.deepEqual(fromInline.returns, fromCore.returns, `${label}：返回值`);
    // ② 订阅者收到的变更序列
    assert.deepEqual(fromInline.events, fromCore.events, `${label}：变更序列`);
  });
}

test("内联与 core 的变更事件 JSON 逐字节一致", () => {
  for (const { label, script } of SCRIPTS) {
    assert.equal(
      JSON.stringify(run(InlineProvider, script).events),
      JSON.stringify(run(CoreProvider, script).events),
      `${label}：事件 JSON`,
    );
  }
});

test("构造函数接受初始策略（与 core 一致）", () => {
  const a = new CoreProvider(ALLOW_TRUSTED);
  const b = new InlineProvider(ALLOW_TRUSTED);
  assert.deepEqual(b.getPolicy("anything"), a.getPolicy("anything"));
  assert.deepEqual(b.getPolicy("anything"), ALLOW_TRUSTED);
});

test("构造函数拒绝非法初始策略（与 core 一致，都抛 schema 错误）", () => {
  const bad = { mode: "not-a-mode", policyRevision: "x" };
  let coreError;
  let inlineError;
  try {
    new CoreProvider(bad);
  } catch (error) {
    coreError = error?.name;
  }
  try {
    new InlineProvider(bad);
  } catch (error) {
    inlineError = error?.name;
  }
  assert.equal(inlineError, coreError);
  assert.notEqual(inlineError, undefined);
});

test("默认策略对象是冻结的（与 core 一致）", () => {
  const a = new CoreProvider().getPolicy("ws");
  const b = new InlineProvider().getPolicy("ws");
  assert.deepEqual(b, a);
  // 两个实现返回的默认值都不应能被改写影响共享状态。
  assert.equal(Object.isFrozen(b), Object.isFrozen(a));
});

test("取消订阅后不再收到变更（与 core 一致）", () => {
  for (const Provider of [CoreProvider, InlineProvider]) {
    const provider = new Provider();
    const seen = [];
    const unsubscribe = provider.subscribe((change) => seen.push(change.policy.mode));
    provider.setWorkspacePolicy("ws-1", ALLOW_TRUSTED);
    unsubscribe();
    provider.setWorkspacePolicy("ws-2", ALLOW_TRUSTED);
    assert.deepEqual(seen, ["allow_trusted_only"], `${Provider.name}：只应收到取消前的变更`);
  }
});
