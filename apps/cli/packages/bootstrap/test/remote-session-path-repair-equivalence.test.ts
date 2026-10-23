// 等价性验证：repairPersistedRemoteSessionPaths 的 core 原版与 protocol 内联版，
// 在同一批输入下必须产出相同结果（返回值或抛出的错误形状）。
//
// 为什么需要它：这个函数原本的测试（resume-ports / runtime-persistence-recovery-three-safety）
// 在当前 Windows 环境下因 ESM 绝对路径问题跑不起来（ERR_UNSUPPORTED_ESM_URL_SCHEME），
// 所以不能靠它们验收内联。这里用「新旧对照」直接证明行为等价。
import assert from "node:assert/strict";
import test from "node:test";
import { repairPersistedRemoteSessionPaths as coreRepair } from "../../core/src/runtime/helpers/session/remote-session-repair.js";
import { repairPersistedRemoteSessionPaths as inlineRepair } from "../src/protocol/remote-session-path-repair.js";

/** 造一条会话记录。 */
function record(overrides = {}) {
  return {
    id: "session-1",
    directory: "/workspace/project",
    path: "/workspace/project",
    workspaceID: "remote:/workspace/project",
    time: { created: 1, updated: 2 },
    ...overrides,
  };
}

/** 造一个可控的存储：记录 repairRemoteSessionPaths 的调用，并返回预设结果。 */
function store({ supportsNarrow = true, matched = true, refreshed } = {}) {
  const calls = [];
  const base = {
    getSession: async () => refreshed,
  };
  if (supportsNarrow) {
    base.repairRemoteSessionPaths = async (input) => {
      calls.push(input);
      return matched;
    };
  }
  return { store: base, calls };
}

/** 跑一次，把「返回值或抛出的错误」归一成可比较的形状。 */
async function outcome(fn, ...args) {
  try {
    return { ok: true, value: await fn(...args) };
  } catch (error) {
    return {
      ok: false,
      type: error?.type,
      message: error?.message,
      recoverable: error?.recoverable,
      contextReason: error?.context?.reason,
    };
  }
}

/** 覆盖各分支的输入组合。 */
const CASES = [
  { label: "无 workspaceID → 原样返回", rec: record({ workspaceID: undefined }), opts: {} },
  { label: "workspaceID 为空白 → 原样返回", rec: record({ workspaceID: "   " }), opts: {} },
  {
    label: "身份非 remote: 前缀 → 原样返回",
    rec: record({ workspaceID: "local:/workspace/project" }),
    opts: {},
  },
  {
    label: "身份非法（remote: 但解析不出路径）→ SessionCorrupted",
    rec: record({ workspaceID: "remote:" }),
    opts: {},
  },
  {
    label: "directory 已是工作区路径 → clean，原样返回",
    rec: record({ directory: "/workspace/project", path: "/workspace/project" }),
    opts: {},
  },
  {
    label: "directory 是身份本身 → repair，走 CAS",
    rec: record({ directory: "remote:/workspace/project" }),
    opts: { matched: true, refreshed: record() },
  },
  {
    label: "directory 是「根 + / + 身份」→ repair",
    rec: record({ directory: "/workspace/project/remote:/workspace/project" }),
    opts: { matched: true, refreshed: record() },
  },
  {
    label: "path 含身份但无法归位 → unsafe，SessionCorrupted",
    rec: record({ path: "/other/remote:/workspace/project/x" }),
    opts: {},
  },
  {
    label: "需要修复但存储不支持窄化 → 回调 + 返回内存修复",
    rec: record({ directory: "remote:/workspace/project" }),
    opts: { supportsNarrow: false },
  },
  {
    label: "CAS 匹配 → 返回回读结果",
    rec: record({ directory: "remote:/workspace/project" }),
    opts: {
      matched: true,
      refreshed: record({ id: "session-1", directory: "/workspace/project" }),
    },
  },
  {
    label: "CAS 匹配但回读为 null → 返回内存修复",
    rec: record({ directory: "remote:/workspace/project" }),
    opts: { matched: true, refreshed: null },
  },
  {
    label: "CAS 不匹配且回读记录消失 → SessionCorrupted",
    rec: record({ directory: "remote:/workspace/project" }),
    opts: { matched: false, refreshed: null },
  },
  {
    label: "CAS 不匹配且回读身份变了 → SessionCorrupted",
    rec: record({ directory: "remote:/workspace/project" }),
    opts: {
      matched: false,
      refreshed: record({ workspaceID: "remote:/other/place" }),
    },
  },
  {
    label: "CAS 不匹配且回读仍不安全 → SessionCorrupted",
    rec: record({ directory: "remote:/workspace/project" }),
    opts: {
      matched: false,
      refreshed: record({ directory: "/x/remote:/workspace/project/y" }),
    },
  },
  {
    label: "CAS 不匹配但回读已干净 → 返回回读结果",
    rec: record({ directory: "remote:/workspace/project" }),
    opts: { matched: false, refreshed: record({ directory: "/workspace/project" }) },
  },
  {
    label: "CAS 不匹配且回读仍需修复 → 回调 + 内存修复",
    rec: record({ directory: "remote:/workspace/project" }),
    opts: {
      matched: false,
      refreshed: record({ directory: "remote:/workspace/project" }),
    },
  },
];

for (const { label, rec, opts } of CASES) {
  test(`内联与 core 结果一致：${label}`, async () => {
    const a = store(opts);
    const b = store(opts);
    const fromCore = await outcome(coreRepair, a.store, rec, {});
    const fromInline = await outcome(inlineRepair, b.store, rec, {});
    assert.deepEqual(fromInline, fromCore);
  });
}

test("内联与 core 发出的 CAS 载荷逐字节一致", async () => {
  for (const { label, rec, opts } of CASES) {
    const a = store(opts);
    const b = store(opts);
    await outcome(coreRepair, a.store, rec, {});
    await outcome(inlineRepair, b.store, rec, {});
    assert.equal(JSON.stringify(b.calls), JSON.stringify(a.calls), `${label}：CAS 载荷应一致`);
  }
});

test("内联与 core 的持久化失败回调一致", async () => {
  for (const { label, rec, opts } of CASES) {
    const errorsA = [];
    const errorsB = [];
    const a = store(opts);
    const b = store(opts);
    await outcome(coreRepair, a.store, rec, {
      onPersistenceFailure: (e) => errorsA.push(String(e?.message ?? e)),
    });
    await outcome(inlineRepair, b.store, rec, {
      onPersistenceFailure: (e) => errorsB.push(String(e?.message ?? e)),
    });
    assert.deepEqual(errorsB, errorsA, `${label}：回调序列应一致`);
  }
});
