// SPDX-License-Identifier: Apache-2.0
// B29 facade 资产：两份 .d.ts 文本（生产与 snippet 子集）、两张注册表、族别查询，
// 以及「身份按声明判定而非按拼写判定」这条贯穿规则。
//
// facade 是脚本作者唯一能看见的 API 面，而注册表是包内三个消费方（站点收集 /
// facade-siting 诊断 / lowering）的唯一真源。两者都属于「重写时一个字都不能改错」的
// 数据面，所以这里的断言是逐字的：声明清单、签名文本、表行的顺序与 op 命名。
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ts from "typescript";

import { dw, importDeep } from "./entry.mjs";

const {
  FACADE_DTS,
  FACADE_FILE_NAME,
  SNIPPET_FACADE_DTS,
  collectDiagnostics,
  createWorkflowProgram,
} = dw;

const registry = await importDeep("facade/registry.js");
const {
  ARTIFACT_REGISTRY,
  SITE_MEMBER_NAMES,
  WORLD_READ_REGISTRY,
  artifactFamilyOf,
  artifactRowOfSymbol,
  facadeContainerOf,
  isArtifactPresetOp,
  isSiteProducing,
  markerFunctionOfSymbol,
  siteProducingFunctionOfSymbol,
  worldReadOpOfSymbol,
} = registry;

/** 取一段 .d.ts 里全部 `declare X name` 声明的名字清单（顺序即文本顺序）。 */
function declaredNames(dts) {
  return [...dts.matchAll(/^declare (function|interface|const) ([A-Za-z]+)/gm)].map(
    (match) => `${match[1]} ${match[2]}`,
  );
}

/** 按行匹配（忽略缩进）：facade 文本里的签名都是带 JSDoc 缩进的。 */
function hasSignature(dts, signature) {
  return dts
    .split("\n")
    .map((line) => line.trim())
    .includes(signature);
}

/**
 * 脚本里每个调用点的 facade 身份，按 checker 解析出的 symbol 查询注册表。
 * 返回 `callee 文本 → 身份` 的表，用来证明「同名不同源」的两个调用得到不同答案。
 */
function identitiesOfCallSites(script, facadeDts) {
  const workflow = createWorkflowProgram(
    script,
    facadeDts === undefined ? undefined : { facadeDts },
  );
  const checker = workflow.program.getTypeChecker();
  const out = new Map();
  const walk = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const nameNode = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
      const symbol = checker.getSymbolAtLocation(nameNode);
      const container = facadeContainerOf(symbol?.declarations?.[0]);
      out.set(callee.getText(), {
        artifact: artifactRowOfSymbol(symbol)?.op,
        container,
        marker: markerFunctionOfSymbol(symbol),
        siteFn: siteProducingFunctionOfSymbol(symbol),
        siteProducing: isSiteProducing(container, symbol?.name ?? ""),
        worldRead: worldReadOpOfSymbol(symbol),
      });
    }
    ts.forEachChild(node, walk);
  };
  walk(workflow.scriptFile);
  return out;
}

describe("B29 facade .d.ts 文本面", () => {
  it("facade 文件名是身份判定用的那个常量", () => {
    // 五处按声明文件名判 facade 身份（registry / sites / facade-misuse / lowering / 编译），
    // snippet 注入时必须仍以它为名，否则站点收集静默变空。
    assert.equal(FACADE_FILE_NAME, "workflow-facade.d.ts");
  });

  it("生产 facade 的声明清单（顺序即文本顺序）", () => {
    assert.deepEqual(declaredNames(FACADE_DTS), [
      "interface Node",
      "interface AgentPersona",
      "interface Agent",
      "function agent",
      "const args",
      "function log",
      "function report",
      "interface ArtifactRef",
      "interface ArtifactOptions",
      "interface ArtifactFileOptions",
      "interface ArtifactField",
      "interface ChartSpec",
      "interface TableSpec",
      "interface MetricsSpec",
      "interface BoardSpec",
      "const artifact",
      "function phase",
      "interface GrepMatch",
      "const files",
      "interface GitStatus",
      "interface GitCommit",
      "const git",
      "interface WorldRunResult",
      "const world",
    ]);
  });

  it("snippet 是生产 facade 减 actor / report / artifact / phase 的子集", () => {
    assert.deepEqual(declaredNames(SNIPPET_FACADE_DTS), [
      "const args",
      "function log",
      "interface GrepMatch",
      "const files",
      "interface GitStatus",
      "interface GitCommit",
      "const git",
      "interface WorldRunResult",
      "const world",
    ]);
    // 子集而非改写：snippet 的每一条 declare 行都逐字节出现在生产文本里。
    for (const line of SNIPPET_FACADE_DTS.split("\n")) {
      if (line.trim().startsWith("declare ")) assert.ok(FACADE_DTS.includes(line), line);
    }
    for (const forbidden of [
      "declare function agent",
      "declare function report",
      "declare function phase",
      "declare const artifact",
      "declare interface Agent",
    ]) {
      assert.equal(SNIPPET_FACADE_DTS.includes(forbidden), false, forbidden);
    }
  });

  it("脚本作者看到的签名逐字如下", () => {
    const production = [
      "declare function agent(name?: string, persona?: string | AgentPersona): Agent;",
      "ask<T = string>(instructions: string): Node<T>;",
      "declare function log(message: string): void;",
      "declare function report(item: unknown, artifactId?: string): void;",
      "declare function phase(name: string): void;",
      "declare const args: Readonly<Record<string, unknown>>;",
      "file(id: string, path: string, opts?: ArtifactFileOptions): Promise<ArtifactRef>;",
      "glob(pattern: string): Promise<string[]>;",
      "read(path: string): Promise<string>;",
      "grep(pattern: string, glob?: string): Promise<GrepMatch[]>;",
      "run(cmd: string, args?: string[], opts?: { timeoutMs?: number }): Promise<WorldRunResult>;",
    ];
    for (const signature of production) {
      assert.ok(hasSignature(FACADE_DTS, signature), signature);
    }
    // snippet 只留得下世界读与 log / args：其余四条在生产里存在即在 snippet 里缺席。
    for (const signature of [
      "declare function log(message: string): void;",
      "declare const args: Readonly<Record<string, unknown>>;",
      "run(cmd: string, args?: string[], opts?: { timeoutMs?: number }): Promise<WorldRunResult>;",
    ]) {
      assert.ok(hasSignature(SNIPPET_FACADE_DTS, signature), signature);
    }
  });

  it("以 snippet 为 facade 编译：四个消失的名字得到 2304，世界读照旧干净", () => {
    const script = `const a = agent("a");
await a.ask("x");
report({ n: 1 });
artifact.file("i", "p");
phase("p");
await files.glob("g");
await world.run("ls");
log("l");
return a;
`;
    assert.deepEqual(collectDiagnostics(createWorkflowProgram(script).program), []);
    const snippet = createWorkflowProgram(script, { facadeDts: SNIPPET_FACADE_DTS });
    assert.deepEqual(
      collectDiagnostics(snippet.program).map((d) => [d.code, d.line, d.column, d.message]),
      [
        [2304, 1, 11, "Cannot find name 'agent'."],
        [2304, 3, 1, "Cannot find name 'report'."],
        [2304, 4, 1, "Cannot find name 'artifact'."],
        [2304, 5, 1, "Cannot find name 'phase'."],
      ],
    );
  });

  it("snippet 姿态下世界读仍然成站点（否则片段编译通过却什么都不做）", () => {
    const workflow = createWorkflowProgram(
      `await files.glob("g");\nawait world.run("ls");\nlog("l");\nreturn args.x;`,
      { facadeDts: SNIPPET_FACADE_DTS },
    );
    assert.deepEqual(collectDiagnostics(workflow.program), []);
    const table = dw.collectSites(workflow);
    assert.deepEqual(
      table.worldReads.map((site) => [site.id, site.op, site.order]),
      [
        ["world-read#1", "glob", 0],
        ["world-read#2", "run", 1],
      ],
    );
    assert.deepEqual(
      [
        table.actors.length,
        table.asks.length,
        table.reports.length,
        table.artifacts.length,
        table.phases.length,
      ],
      [0, 0, 0, 0, 0],
    );
  });
});

describe("B29 两张注册表", () => {
  it("world-read 表：八行 (容器, 成员) → op，容器参与判定", () => {
    assert.deepEqual(WORLD_READ_REGISTRY, [
      { container: "files", member: "glob", op: "glob" },
      { container: "files", member: "read", op: "read" },
      { container: "files", member: "grep", op: "grep" },
      { container: "git", member: "changedFiles", op: "git-changed-files" },
      { container: "git", member: "diff", op: "git-diff" },
      { container: "git", member: "status", op: "git-status" },
      { container: "git", member: "log", op: "git-log" },
      { container: "world", member: "run", op: "run" },
    ]);
    // op 命名不与成员名强绑：git.log → "git-log" 是这张表存在的理由（与顶层 log() 撞名）。
    assert.deepEqual(
      WORLD_READ_REGISTRY.map((row) => row.op),
      ["glob", "read", "grep", "git-changed-files", "git-diff", "git-status", "git-log", "run"],
    );
  });

  it("artifact 表：六行，op 与成员同名，族别住在同一行里", () => {
    assert.deepEqual(ARTIFACT_REGISTRY, [
      { container: "artifact", member: "file", op: "file", family: "content" },
      { container: "artifact", member: "markdown", op: "markdown", family: "content" },
      { container: "artifact", member: "chart", op: "chart", family: "preset" },
      { container: "artifact", member: "table", op: "table", family: "preset" },
      { container: "artifact", member: "metrics", op: "metrics", family: "preset" },
      { container: "artifact", member: "board", op: "board", family: "preset" },
    ]);
  });

  it("两张表刻意分开：world-read 的每一行都落到 driver，产物预置族根本不过 driver", () => {
    const worldOps = new Set(WORLD_READ_REGISTRY.map((row) => row.op));
    const artifactOps = new Set(ARTIFACT_REGISTRY.map((row) => row.op));
    for (const op of artifactOps) assert.equal(worldOps.has(op), false, op);
  });

  it("族别查询：artifactFamilyOf 与 isArtifactPresetOp 与表一致", () => {
    assert.deepEqual(
      ARTIFACT_REGISTRY.map((row) => [
        row.op,
        artifactFamilyOf(row.op),
        isArtifactPresetOp(row.op),
      ]),
      [
        ["file", "content", false],
        ["markdown", "content", false],
        ["chart", "preset", true],
        ["table", "preset", true],
        ["metrics", "preset", true],
        ["board", "preset", true],
      ],
    );
  });

  it("isArtifactPresetOp 收任意字符串：不在表里就不是预置（含 undefined / null / 大小写）", () => {
    for (const value of ["", "File", "FILE", "glob", "run", "unknown", undefined, null, 0, {}]) {
      assert.equal(isArtifactPresetOp(value), false, String(value));
    }
  });

  it("artifactFamilyOf 对表外的 op 抛错而不是默默给一个族", () => {
    assert.throws(() => artifactFamilyOf("nope"), /unknown artifact op: nope/);
  });

  it('SITE_MEMBER_NAMES 是裸名候选集：15 个、无重名、含来自 git.log 的 "log"', () => {
    assert.equal(SITE_MEMBER_NAMES.size, 15);
    assert.deepEqual([...SITE_MEMBER_NAMES].sort(), [
      "ask",
      "board",
      "changedFiles",
      "chart",
      "diff",
      "file",
      "glob",
      "grep",
      "log",
      "markdown",
      "metrics",
      "read",
      "run",
      "status",
      "table",
    ]);
    // 名字本身答不了身份问题：同一个 "log" 在容器下产站点、在顶层不产。
    assert.equal(isSiteProducing("git", "log"), true);
    assert.equal(isSiteProducing(undefined, "log"), false);
  });

  it("isSiteProducing 的真值表", () => {
    const cases = [
      [undefined, "agent", true],
      [undefined, "report", true],
      [undefined, "log", false],
      [undefined, "phase", false],
      [undefined, "glob", false],
      ["Agent", "ask", true],
      ["files", "glob", true],
      ["files", "read", true],
      ["files", "grep", true],
      ["git", "changedFiles", true],
      ["git", "diff", true],
      ["git", "status", true],
      ["git", "log", true],
      ["world", "run", true],
      ["artifact", "file", true],
      ["artifact", "markdown", true],
      ["artifact", "chart", true],
      ["artifact", "table", true],
      ["artifact", "metrics", true],
      ["artifact", "board", true],
      ["artifact", "nope", false],
      ["files", "nope", false],
      ["Agent", "nope", false],
      ["Mine", "glob", false],
    ];
    for (const [container, member, expected] of cases) {
      assert.equal(isSiteProducing(container, member), expected, `${container}.${member}`);
    }
  });
});

describe("B29 身份按声明判定，不按拼写", () => {
  it("facade 调用与脚本自定义的同名调用在注册表里是两个答案", () => {
    const identities = identitiesOfCallSites(`
const a = agent("a");
await a.ask("x");
await files.glob("g");
await git.log(1);
await world.run("ls");
artifact.file("i", "p");
artifact.chart("c", { x: { field: "a" }, y: { field: "b" } });
log("l");
phase("p");
report({});
const mine = { glob: () => 1, ask: () => 1, log: () => 1 };
await mine.glob();
await mine.ask();
mine.log();
`);
    // facade 侧：容器 + 各自的查询出口。
    assert.deepEqual(identities.get("agent"), {
      artifact: undefined,
      container: undefined,
      marker: undefined,
      siteFn: "agent",
      siteProducing: true,
      worldRead: undefined,
    });
    assert.deepEqual(identities.get("a.ask"), {
      artifact: undefined,
      container: "Agent",
      marker: undefined,
      siteFn: undefined,
      siteProducing: true,
      worldRead: undefined,
    });
    assert.deepEqual(identities.get("git.log"), {
      artifact: undefined,
      container: "git",
      marker: undefined,
      siteFn: undefined,
      siteProducing: true,
      worldRead: "git-log",
    });
    assert.deepEqual(identities.get("log"), {
      artifact: undefined,
      container: undefined,
      marker: undefined,
      siteFn: undefined,
      siteProducing: false,
      worldRead: undefined,
    });
    assert.deepEqual(identities.get("phase"), {
      artifact: undefined,
      container: undefined,
      marker: "phase",
      siteFn: undefined,
      siteProducing: false,
      worldRead: undefined,
    });
    assert.deepEqual(identities.get("artifact.file"), {
      artifact: "file",
      container: "artifact",
      marker: undefined,
      siteFn: undefined,
      siteProducing: true,
      worldRead: undefined,
    });
    // 脚本自己造的对象：同名成员什么身份都没有。
    for (const callee of ["mine.glob", "mine.ask", "mine.log"]) {
      assert.deepEqual(
        identities.get(callee),
        {
          artifact: undefined,
          container: undefined,
          marker: undefined,
          siteFn: undefined,
          siteProducing: false,
          worldRead: undefined,
        },
        callee,
      );
    }
  });

  it("计算成员访问在注册表查询这一层什么身份都不是", () => {
    // 注册表的 symbol 查询只在**属性访问**的形状上有答案：sites.ts 的收集器读的也是
    // `access.name` 的 symbol，所以 `files["glob"]` 在这里不是"另一种拼写的同一身份"，
    // 而是彻底查不到。这不构成漏洞：恰好因为查不到、它也没有站点，facade-misuse 会把它
    // 当未授权的直接调用拒绝（9001，dw01 的范围，本合同只记这一句依据）。
    const identities = identitiesOfCallSites(`
await files["glob"]("g");
await files.glob("g");
`);
    assert.deepEqual(identities.get('files["glob"]'), {
      artifact: undefined,
      container: undefined,
      marker: undefined,
      siteFn: undefined,
      siteProducing: false,
      worldRead: undefined,
    });
    assert.equal(identities.get("files.glob").worldRead, "glob");
  });

  it("snippet 姿态下 facade 名字不再是 facade（身份随声明文本走）", () => {
    // snippet 没声明 `phase`，脚本里那次调用因此没有 symbol（TS2304），
    // 注册表按声明判定，答案只能是"无身份"；`files` 在两份文本里都声明了，身份不变。
    const identities = identitiesOfCallSites(
      `phase("p");\nawait files.glob("g");`,
      SNIPPET_FACADE_DTS,
    );
    assert.deepEqual(identities.get("phase"), {
      artifact: undefined,
      container: undefined,
      marker: undefined,
      siteFn: undefined,
      siteProducing: false,
      worldRead: undefined,
    });
    assert.deepEqual(identities.get("files.glob"), {
      artifact: undefined,
      container: "files",
      marker: undefined,
      siteFn: undefined,
      siteProducing: true,
      worldRead: "glob",
    });
  });
});
