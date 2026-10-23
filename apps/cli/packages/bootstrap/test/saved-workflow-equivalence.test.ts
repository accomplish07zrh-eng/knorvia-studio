// 等价性验证：saved-workflow 的 store / frontmatter 内联版与 core 原版，
// 在同一批真实文件系统操作下必须产出相同结果。
//
// 用真实临时目录（而不是 mock fs）：这些函数的核心行为就是「按作用域查找 / 遮蔽 / 搬运」，
// mock 掉 fs 等于不测。
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  listSavedWorkflows as coreList,
  moveSavedWorkflow as coreMove,
  resolveSavedWorkflow as coreResolve,
  savedWorkflowPath as corePath,
  savedWorkflowRoot as coreRoot,
} from "../../core/src/tool/handlers/saved-workflows/store.js";
import {
  parseSavedWorkflow as coreParse,
  serializeSavedWorkflow as coreSerialize,
} from "../../core/src/tool/handlers/saved-workflows/frontmatter.js";
import {
  listSavedWorkflows as inlineList,
  moveSavedWorkflow as inlineMove,
  resolveSavedWorkflow as inlineResolve,
  savedWorkflowPath as inlinePath,
  savedWorkflowRoot as inlineRoot,
} from "../src/protocol/saved-workflow-store.js";
import {
  parseSavedWorkflow as inlineParse,
  serializeSavedWorkflow as inlineSerialize,
} from "../src/protocol/saved-workflow-frontmatter.js";

/** 建一个临时工作区（cwd + homeDir 两个目录）。 */
function makeWorkspace() {
  const base = mkdtempSync(join(tmpdir(), "swf-equiv-"));
  const cwd = join(base, "project");
  const home = join(base, "home");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(home, { recursive: true });
  return { base, cwd, home, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

/** 一个合法的元数据对象。 */
function meta(overrides = {}) {
  return { description: "test workflow", ...overrides };
}

// ── frontmatter：纯函数，直接对照 ────────────────────────────────

test("serializeSavedWorkflow 与 core 逐字节一致（含可选字段的三种组合）", () => {
  const cases = [
    { meta: meta(), script: "const x = 1;" },
    { meta: meta({ whenToUse: "when needed" }), script: "run();" },
    { meta: meta({ args: [{ name: "a" }] }), script: "body" },
    { meta: meta({ whenToUse: "w", args: [{ name: "a" }] }), script: "" },
  ];
  for (const { meta: m, script } of cases) {
    assert.equal(inlineSerialize(m, script), coreSerialize(m, script));
  }
});

test("parseSavedWorkflow 与 core 结果一致（覆盖四类失败 + 成功）", () => {
  const sources = [
    "",
    "no frontmatter here",
    "/* knorvia-workflow\n",
    "/* knorvia-workflow\ndescription: ok\n*/\nconst x = 1;",
    "/* zcode-workflow\ndescription: legacy\n*/\nbody",
    "\n\n/* knorvia-workflow\ndescription: after blanks\n*/\nscript",
    "/* knorvia-workflow\n: bad yaml :\n*/\nx",
    "/* knorvia-workflow\n{}\n*/\nx",
  ];
  for (const source of sources) {
    assert.deepEqual(inlineParse(source), coreParse(source), `source=${JSON.stringify(source)}`);
  }
});

// ── store：真实文件系统对照 ─────────────────────────────────────

test("savedWorkflowRoot / savedWorkflowPath 与 core 一致", () => {
  const ws = makeWorkspace();
  try {
    for (const scope of ["project", "global"]) {
      const a = inlineRoot(ws.cwd, scope, { homeDir: ws.home });
      const b = coreRoot(ws.cwd, scope, { homeDir: ws.home });
      assert.deepEqual(a, b);
      assert.equal(inlinePath(a, "demo"), corePath(b, "demo"));
    }
  } finally {
    ws.cleanup();
  }
});

test("listSavedWorkflows 在空工作区与 core 一致", () => {
  const ws = makeWorkspace();
  try {
    assert.deepEqual(
      inlineList({ cwd: ws.cwd, homeDir: ws.home }),
      coreList({ cwd: ws.cwd, homeDir: ws.home }),
    );
  } finally {
    ws.cleanup();
  }
});

test("listSavedWorkflows 对坏文件 / 非法名 / 遮蔽的处理与 core 一致", () => {
  const ws = makeWorkspace();
  try {
    const projectRoot = inlineRoot(ws.cwd, "project", { homeDir: ws.home });
    const globalRoot = inlineRoot(ws.cwd, "global", { homeDir: ws.home });
    mkdirSync(projectRoot.dir, { recursive: true });
    mkdirSync(globalRoot.dir, { recursive: true });

    // 项目档：一个正常、一个坏 YAML、一个非法文件名、一个同名（遮蔽全局）
    writeFileSync(
      join(projectRoot.dir, "good.dwf.ts"),
      coreSerialize(meta({ description: "project good" }), "p()"),
      "utf8",
    );
    writeFileSync(join(projectRoot.dir, "bad.dwf.ts"), "not a workflow", "utf8");
    writeFileSync(join(projectRoot.dir, "has space.dwf.ts"), "x", "utf8");
    writeFileSync(
      join(projectRoot.dir, "shadowed.dwf.ts"),
      coreSerialize(meta({ description: "project shadow" }), "ps()"),
      "utf8",
    );
    // 全局档：一个正常、一个与项目同名的（应被遮蔽）
    writeFileSync(
      join(globalRoot.dir, "global-only.dwf.ts"),
      coreSerialize(meta({ description: "global only" }), "g()"),
      "utf8",
    );
    writeFileSync(
      join(globalRoot.dir, "shadowed.dwf.ts"),
      coreSerialize(meta({ description: "global shadow" }), "gs()"),
      "utf8",
    );

    const inlineResult = inlineList({ cwd: ws.cwd, homeDir: ws.home });
    const coreResult = coreList({ cwd: ws.cwd, homeDir: ws.home });
    assert.deepEqual(inlineResult, coreResult);

    // 指定 scope 时不遮蔽：两个作用域各自列出自己的
    for (const scope of ["project", "global"]) {
      assert.deepEqual(
        inlineList({ cwd: ws.cwd, scope, homeDir: ws.home }),
        coreList({ cwd: ws.cwd, scope, homeDir: ws.home }),
        `scope=${scope}`,
      );
    }
  } finally {
    ws.cleanup();
  }
});

test("resolveSavedWorkflow 对找到 / 未找到 / 非法名 / 坏文件 / 遮蔽与 core 一致", () => {
  const ws = makeWorkspace();
  try {
    const projectRoot = inlineRoot(ws.cwd, "project", { homeDir: ws.home });
    const globalRoot = inlineRoot(ws.cwd, "global", { homeDir: ws.home });
    mkdirSync(projectRoot.dir, { recursive: true });
    mkdirSync(globalRoot.dir, { recursive: true });
    writeFileSync(
      join(projectRoot.dir, "p.dwf.ts"),
      coreSerialize(meta({ description: "P" }), "p()"),
      "utf8",
    );
    writeFileSync(
      join(globalRoot.dir, "g.dwf.ts"),
      coreSerialize(meta({ description: "G" }), "g()"),
      "utf8",
    );
    writeFileSync(
      join(globalRoot.dir, "p.dwf.ts"),
      coreSerialize(meta({ description: "GP" }), "gp()"),
      "utf8",
    );
    writeFileSync(join(projectRoot.dir, "broken.dwf.ts"), "junk", "utf8");

    const cases = [
      { name: "p" },
      { name: "g" },
      { name: "broken" },
      { name: "missing" },
      { name: "bad name!" },
      { name: "p", scope: "global" },
      { name: "p", scope: "project" },
    ];
    for (const c of cases) {
      const opts = { cwd: ws.cwd, homeDir: ws.home, ...c };
      assert.deepEqual(inlineResolve(opts), coreResolve(opts), JSON.stringify(c));
    }
  } finally {
    ws.cleanup();
  }
});

test("moveSavedWorkflow 对成功 / 未找到 / 目标已存在 / 非法名与 core 一致", () => {
  // 每个场景独立工作区，避免相互影响（移动会改变磁盘状态）。
  for (const scenario of ["move-ok", "not-found", "target-exists", "invalid-name"]) {
    const wsA = makeWorkspace();
    const wsB = makeWorkspace();
    try {
      for (const [ws, impl] of [
        [wsA, { root: coreRoot, move: coreMove, serialize: coreSerialize }],
        [wsB, { root: inlineRoot, move: inlineMove, serialize: inlineSerialize }],
      ]) {
        const projectRoot = impl.root(ws.cwd, "project", { homeDir: ws.home });
        const globalRoot = impl.root(ws.cwd, "global", { homeDir: ws.home });
        mkdirSync(projectRoot.dir, { recursive: true });
        mkdirSync(globalRoot.dir, { recursive: true });
        if (scenario !== "not-found") {
          writeFileSync(
            join(globalRoot.dir, "demo.dwf.ts"),
            impl.serialize(meta({ description: "demo" }), "d()"),
            "utf8",
          );
        }
        if (scenario === "target-exists") {
          writeFileSync(
            join(projectRoot.dir, "demo.dwf.ts"),
            impl.serialize(meta({ description: "existing" }), "e()"),
            "utf8",
          );
        }
      }

      const name = scenario === "invalid-name" ? "bad name!" : "demo";
      const coreResult = coreMove({ cwd: wsA.cwd, name, homeDir: wsA.home });
      const inlineResult = inlineMove({ cwd: wsB.cwd, name, homeDir: wsB.home });

      // 路径里的临时目录名不同，比较前把各自 base 替换掉。
      const normalize = (value, ws) =>
        JSON.parse(JSON.stringify(value).replaceAll(ws.base.replaceAll("\\", "\\\\"), "<base>"));
      assert.deepEqual(normalize(inlineResult, wsB), normalize(coreResult, wsA), scenario);

      // 磁盘上的最终文件名集合也要一致。
      const namesOf = (ws, root) => {
        try {
          return readdirSync(root.dir).sort();
        } catch {
          return [];
        }
      };
      assert.deepEqual(
        namesOf(wsB, inlineRoot(wsB.cwd, "project", { homeDir: wsB.home })),
        namesOf(wsA, coreRoot(wsA.cwd, "project", { homeDir: wsA.home })),
        `${scenario}：项目档文件名集合`,
      );
      assert.deepEqual(
        namesOf(wsB, inlineRoot(wsB.cwd, "global", { homeDir: wsB.home })),
        namesOf(wsA, coreRoot(wsA.cwd, "global", { homeDir: wsA.home })),
        `${scenario}：全局档文件名集合`,
      );
    } finally {
      wsA.cleanup();
      wsB.cleanup();
    }
  }
});

test("moveSavedWorkflow 逐字节搬运（不重新序列化）与 core 一致", () => {
  const ws = makeWorkspace();
  try {
    const globalRoot = inlineRoot(ws.cwd, "global", { homeDir: ws.home });
    mkdirSync(globalRoot.dir, { recursive: true });
    // 手写一份排版特殊的文件：若被重新序列化，字节会变。
    const handwritten =
      "/* knorvia-workflow\ndescription:    spaced   \n\nargs:\n  - name: x\n*/\nconst keep = 1;";
    writeFileSync(join(globalRoot.dir, "raw.dwf.ts"), handwritten, "utf8");

    const result = inlineMove({ cwd: ws.cwd, name: "raw", homeDir: ws.home });
    assert.equal(result.ok, true);
    const projectRoot = inlineRoot(ws.cwd, "project", { homeDir: ws.home });
    assert.equal(readFileSync(join(projectRoot.dir, "raw.dwf.ts"), "utf8"), handwritten);
  } finally {
    ws.cleanup();
  }
});
