// SPDX-License-Identifier: Apache-2.0
// B25 lowering（降级）：facade 调用按站点身份改写成 `__host.*`、类型擦除、可选链短路保留、
// 输出契约（async 函数体 + 唯一自由标识符 `__host`）、脏脚本不降级。
//
// 期望串一律是旧实现逐字节打印出来的产物，包括打印机的怪癖（`await(` 之间没有空格、
// 新建的字面量把非 ASCII 转义而原样保留的字面量不转义）。这些不是笔误而是契约：沙箱
// 拿到的是这段文本，谁重写它就要对自己的字节负责。
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import vm from "node:vm";

import { dw } from "./entry.mjs";

const {
  HOST_BINDING,
  analyzeWorkflowScript,
  collectSites,
  createWorkflowProgram,
  lowerWorkflow,
  lowerWorkflowScript,
} = dw;

/** 把逐行写下的期望拼成 lowering 的产物形状：语句之间一个换行，末尾一个换行。 */
function body(...lines) {
  return `${lines.join("\n")}\n`;
}

/** 干净脚本的 code（不干净就直接失败，错误里带上诊断）。 */
function codeOf(script) {
  const res = lowerWorkflowScript(script);
  if (res.ok !== true) {
    assert.fail(`脚本没有过 lowering 门槛：${JSON.stringify(res.diagnostics)}`);
  }
  return res.lowered.code;
}

function loweredOf(script) {
  const res = lowerWorkflowScript(script);
  if (res.ok !== true) {
    assert.fail(`脚本没有过 lowering 门槛：${JSON.stringify(res.diagnostics)}`);
  }
  return res.lowered;
}

/**
 * 一个够用的假 host：记录每次 Boundary A 调用，返回可直接 await 的值。
 * 用它把 lowered code 真跑一遍——「沙箱只供 ES intrinsics + `__host`」这条契约只能这样验。
 */
function makeHost(extra = {}) {
  const calls = [];
  const actor = { __actor: true };
  const host = {
    args: {},
    createActor: (...a) => {
      calls.push(["createActor", ...a]);
      return actor;
    },
    ask: (...a) => {
      calls.push(["ask", a[0], a[1] === actor ? "<actor>" : a[1], ...a.slice(2)]);
      return Promise.resolve("answer");
    },
    enterPhase: (...a) => calls.push(["enterPhase", ...a]),
    log: (...a) => calls.push(["log", ...a]),
    report: (...a) => calls.push(["report", ...a]),
    worldRead: (...a) => {
      calls.push(["worldRead", ...a]);
      return Promise.resolve([]);
    },
    publishArtifact: (...a) => {
      calls.push(["publishArtifact", ...a]);
      return Promise.resolve({ id: a[1], version: 1 });
    },
    declareArtifact: (...a) => calls.push(["declareArtifact", ...a]),
    ...extra,
  };
  return { calls, host };
}

/** 按 harness 约定的形状执行 lowered 体：包进 async 函数，只绑一个 `__host`。 */
async function runLowered(lowered, host) {
  const fn = new Function(HOST_BINDING, `return (async () => {\n${lowered.code}\n})();`);
  return await fn(host);
}

describe("B25 站点改写的形状", () => {
  it("harness 绑定的自由标识符就是 __host", () => {
    assert.equal(HOST_BINDING, "__host");
  });

  it("agent / ask / phase / log / report 一次降级", () => {
    const lowered = loweredOf(`
const alice = agent("alice", "researcher");
const r = await alice.ask("do it");
phase("gate");
log("done");
report({ ok: true });
return r;
`);
    assert.equal(
      lowered.code,
      body(
        'const alice = __host.createActor("actor#1", "alice", "researcher");',
        'const r = await __host.ask("ask#1", alice, "do it");',
        '__host.enterPhase("gate");',
        '__host.log("done");',
        '__host.report("report#1", { ok: true });',
        "return r;",
      ),
    );
    // siteIds 只含被打桩的五类：log 与 phase 没有站点。
    assert.deepEqual(lowered.siteIds, ["actor#1", "ask#1", "report#1"]);
  });

  it("ask 丢弃类型实参，schema 名不进 code", () => {
    const code = codeOf(`
interface Plan { steps: string[] }
const a = agent("a");
const p = await a.ask<Plan>("plan");
return p;
`);
    assert.equal(
      code,
      body(
        'const a = __host.createActor("actor#1", "a");',
        'const p = await __host.ask("ask#1", a, "plan");',
        "return p;",
      ),
    );
    assert.doesNotMatch(code, /Plan/);
  });

  it("连被 schema 拒收的类型实参也照样降级（lowering 不看 schema）", () => {
    const lowered = loweredOf(`
const a = agent("a");
const d = await a.ask<Date>("when");
return d;
`);
    assert.equal(
      lowered.code,
      body(
        'const a = __host.createActor("actor#1", "a");',
        'const d = await __host.ask("ask#1", a, "when");',
        "return d;",
      ),
    );
    assert.deepEqual(lowered.siteIds, ["actor#1", "ask#1"]);
  });

  it("report 的第二个实参（预置标签）原样跟着走", () => {
    assert.equal(
      codeOf(
        `artifact.chart("ch", { x: { field: "a" }, y: { field: "b" } });\nreport({ a: 1 }, "ch");`,
      ),
      body(
        '__host.declareArtifact("artifact#1", "chart", ["ch", { x: { field: "a" }, y: { field: "b" } }]);',
        '__host.report("report#1", { a: 1 }, "ch");',
      ),
    );
  });

  it("artifact 两族同形不同名：内容是 publishArtifact，预置是 declareArtifact", () => {
    const lowered = loweredOf(`
artifact.file("out", "a.txt", { contentType: "text/plain", title: "T" });
artifact.markdown("md", "# hi");
artifact.chart("ch", { x: { field: "a" }, y: { field: "b" } });
artifact.table("tb", { columns: [{ field: "a" }] });
artifact.metrics("mt", { metrics: [{ field: "a", label: "A" }] });
artifact.board("bd", { key: "id", status: "st", columns: ["a", "b"] });
`);
    assert.equal(
      lowered.code,
      body(
        '__host.publishArtifact("artifact#1", "file", ["out", "a.txt", { contentType: "text/plain", title: "T" }]);',
        '__host.publishArtifact("artifact#2", "markdown", ["md", "# hi"]);',
        '__host.declareArtifact("artifact#3", "chart", ["ch", { x: { field: "a" }, y: { field: "b" } }]);',
        '__host.declareArtifact("artifact#4", "table", ["tb", { columns: [{ field: "a" }] }]);',
        '__host.declareArtifact("artifact#5", "metrics", ["mt", { metrics: [{ field: "a", label: "A" }] }]);',
        '__host.declareArtifact("artifact#6", "board", ["bd", { key: "id", status: "st", columns: ["a", "b"] }]);',
      ),
    );
    assert.deepEqual(lowered.siteIds, [
      "artifact#1",
      "artifact#2",
      "artifact#3",
      "artifact#4",
      "artifact#5",
      "artifact#6",
    ]);
  });

  it("world 读取与 git 观察一律收成 worldRead(siteId, op, [实参])，实参按位置打包", () => {
    const lowered = loweredOf(`
const st = await world.run("git", ["status", "--porcelain"], { timeoutMs: 5000 });
const g = await git.changedFiles("main");
const d = await git.diff();
const s = await git.status();
const l = await git.log(5);
const gr = await files.grep("TODO", "*.ts");
const gl = await files.glob("src/**/*.ts");
const rd = files.read("a.txt");
report({ st, g, d, s, l, gr, gl, rd });
`);
    assert.equal(
      lowered.code,
      body(
        'const st = await __host.worldRead("world-read#1", "run", ["git", ["status", "--porcelain"], { timeoutMs: 5000 }]);',
        'const g = await __host.worldRead("world-read#2", "git-changed-files", ["main"]);',
        'const d = await __host.worldRead("world-read#3", "git-diff", []);',
        'const s = await __host.worldRead("world-read#4", "git-status", []);',
        'const l = await __host.worldRead("world-read#5", "git-log", [5]);',
        'const gr = await __host.worldRead("world-read#6", "grep", ["TODO", "*.ts"]);',
        'const gl = await __host.worldRead("world-read#7", "glob", ["src/**/*.ts"]);',
        'const rd = __host.worldRead("world-read#8", "read", ["a.txt"]);',
        '__host.report("report#1", { st, g, d, s, l, gr, gl, rd });',
      ),
    );
    // 元数不进 lowering：零实参的 op 也得一个空数组，校验归引擎与 driver。
    assert.match(lowered.code, /"git-diff", \[\]/);
  });

  it("log 走 checker 解析的名字而不是站点表（它没有站点）", () => {
    assert.equal(codeOf(`log("一");\nlog("二");`), body('__host.log("一");', '__host.log("二");'));
  });

  it("facade 声明的 args 读数改成 __host.args，脚本自己的同名绑定不动", () => {
    const lowered = loweredOf(`
const a1 = String(args["topic"]);
const { topic } = args;
const copy = { ...args };
const isU = args === undefined;
const tOf = typeof args;
const pair = [args];
const cond = args ? args.x : null;
function f(args: { y: number }) { return args.y; }
report({ a1, topic, copy, isU, tOf, pair, cond, h: f({ y: 1 }) });
`);
    assert.equal(
      lowered.code,
      body(
        'const a1 = String(__host.args["topic"]);',
        "const { topic } = __host.args;",
        "const copy = { ...__host.args };",
        "const isU = __host.args === undefined;",
        "const tOf = typeof __host.args;",
        "const pair = [__host.args];",
        "const cond = __host.args ? __host.args.x : null;",
        "function f(args) { return args.y; }",
        '__host.report("report#1", { a1, topic, copy, isU, tOf, pair, cond, h: f({ y: 1 }) });',
      ),
    );
    assert.deepEqual(lowered.siteIds, ["report#1"]);
  });

  it("简写属性里的 args 不改写（改了会写出非法语法），代价是留一个自由标识符", () => {
    const code = codeOf(`const sh = { args };\nreport(sh);`);
    assert.equal(code, body("const sh = { args };", '__host.report("report#1", sh);'));
    // 仍然是一段能解析的 JS（只是解析出个不存在的 `args`）——见 known-differences.md。
    new vm.Script(`(async () => { ${code} })()`);
  });
});

describe("B25 可选链的短路保留", () => {
  it("标识符 receiver：守卫三目，不引入临时变量", () => {
    assert.equal(
      codeOf(`
const p = agent("planner");
let maybe = Math.random() > 0.5 ? p : null;
const r = await maybe?.ask("plan");
return r;
`),
      body(
        'const p = __host.createActor("actor#1", "planner");',
        "let maybe = Math.random() > 0.5 ? p : null;",
        'const r = await(maybe === null || maybe === undefined ? undefined : __host.ask("ask#1", maybe, "plan"));',
        "return r;",
      ),
    );
  });

  it("非标识符 receiver：hoisted 临时变量恰好求值一次", () => {
    assert.equal(
      codeOf(`
const a = agent("a");
const b = agent("b");
const pick = (k: number) => (k ? a : b);
const r = await pick(1)?.ask("x");
return r;
`),
      body(
        "var _a;",
        'const a = __host.createActor("actor#1", "a");',
        'const b = __host.createActor("actor#2", "b");',
        "const pick = (k) => (k ? a : b);",
        'const r = await((_a = pick(1)) === null || _a === undefined ? undefined : __host.ask("ask#1", _a, "x"));',
        "return r;",
      ),
    );
  });

  it("多个非标识符 receiver 复用同一批临时变量名", () => {
    assert.equal(
      codeOf(`
const a = agent("a");
const b = agent("b");
const pick = (k: number) => (k ? a : b);
const r = await pick(1)?.ask("x");
const list = [a, b];
const r2 = await list[0]!.ask("y");
const r3 = await ((k: number) => (k ? a : undefined))(0)?.ask("z");
return { r, r2, r3 };
`),
      body(
        "var _a, _b;",
        'const a = __host.createActor("actor#1", "a");',
        'const b = __host.createActor("actor#2", "b");',
        "const pick = (k) => (k ? a : b);",
        'const r = await((_a = pick(1)) === null || _a === undefined ? undefined : __host.ask("ask#1", _a, "x"));',
        "const list = [a, b];",
        'const r2 = await __host.ask("ask#2", list[0], "y");',
        'const r3 = await((_a = ((k) => (k ? a : undefined))(0)) === null || _a === undefined ? undefined : __host.ask("ask#3", _a, "z"));',
        "return { r, r2, r3 };",
      ),
    );
  });

  it("receiver 自己带可选链时内层语义原样保留", () => {
    assert.equal(
      codeOf(`
const a = agent("a");
const holder = { a };
const r = await holder.a?.ask("x");
const deep = { h: holder };
const r2 = await deep?.h.a?.ask("y");
return { r, r2 };
`),
      body(
        "var _a, _b;",
        'const a = __host.createActor("actor#1", "a");',
        "const holder = { a };",
        'const r = await((_a = holder.a) === null || _a === undefined ? undefined : __host.ask("ask#1", _a, "x"));',
        "const deep = { h: holder };",
        'const r2 = await((_a = deep?.h.a) === null || _a === undefined ? undefined : __host.ask("ask#2", _a, "y"));',
        "return { r, r2 };",
      ),
    );
  });

  it("非可选链的直接调用不包守卫，非空断言被擦除", () => {
    assert.equal(
      codeOf(`
const a = agent("a");
const b = agent("b");
const list = [a, b];
const r2 = await list[0]!.ask("y");
return r2;
`),
      body(
        'const a = __host.createActor("actor#1", "a");',
        'const b = __host.createActor("actor#2", "b");',
        "const list = [a, b];",
        'const r2 = await __host.ask("ask#1", list[0], "y");',
        "return r2;",
      ),
    );
  });

  it("守卫命中时 receiver 与实参都不求值：一次 host 调用都没有", async () => {
    const lowered = loweredOf(`
let side = 0;
const bump = () => { side += 1; return "asked"; };
const r = await (Number(args.n) > 100 ? agent("a") : null)?.ask(bump());
return side;
`);
    assert.equal(
      lowered.code,
      body(
        "var _a;",
        "let side = 0;",
        'const bump = () => { side += 1; return "asked"; };',
        'const r = await((_a = (Number(__host.args.n) > 100 ? __host.createActor("actor#1", "a") : null)) === null || _a === undefined ? undefined : __host.ask("ask#1", _a, bump()));',
        "return side;",
      ),
    );
    // siteIds 是站点表的发现序：先撞上 CallExpression 再下钻 receiver，故 ask 在 actor 之前。
    assert.deepEqual(lowered.siteIds, ["ask#1", "actor#1"]);

    const off = makeHost({ args: { n: 0 } });
    assert.equal(await runLowered(lowered, off.host), 0);
    assert.deepEqual(off.calls, []);

    const on = makeHost({ args: { n: 200 } });
    assert.equal(await runLowered(lowered, on.host), 1);
    assert.deepEqual(on.calls, [
      ["createActor", "actor#1", "a"],
      ["ask", "ask#1", "<actor>", "asked"],
    ]);
  });
});

describe("B25 输出契约：函数体、类型擦除、确定性", () => {
  it("空脚本降级成空串，站点表为空", () => {
    const lowered = loweredOf("");
    assert.equal(lowered.code, "");
    assert.deepEqual(lowered.siteIds, []);
  });

  it("只有 return 的脚本：顶层 return 原样留在体里", () => {
    assert.equal(loweredOf(`return { done: true };`).code, body("return { done: true };"));
  });

  it("return 之后的语句不裁剪：lowering 不做可达性分析", () => {
    assert.equal(
      lowerWorkflowScript(`return 1;\nlog("unreachable");`).lowered.code,
      body("return 1;", '__host.log("unreachable");'),
    );
  });

  it("interface / type 消失，enum / class 留下可运行的 JS", () => {
    const lowered = loweredOf(`
interface Plan { steps: string[] }
type Box = { n: number };
enum E { A = 1, B }
const enum CE { X = 2 }
class Point { x: number = 1; get twice(): number { return this.x * 2; } }
function id<T>(v: T): T { return v; }
const a = agent("a");
const p = await a.ask<Plan>("plan");
const b: Box = { n: id(1) };
const s = <string>("5");
const t = "7" satisfies string;
const e: E = E.A;
const ce: CE = CE.X;
const pt = new Point();
function opt(x?: string, y: number = 2): string { return x ?? String(y); }
return { p, b, s, t, e, ce, pt, m: pt.twice, erased: opt(s), decl: id };
`);
    assert.equal(
      lowered.code,
      body(
        "var E;",
        "(function (E) {",
        '    E[E["A"] = 1] = "A";',
        '    E[E["B"] = 2] = "B";',
        "})(E || (E = {}));",
        "var CE;",
        "(function (CE) {",
        '    CE[CE["X"] = 2] = "X";',
        "})(CE || (CE = {}));",
        "class Point {",
        "    x = 1;",
        "    get twice() { return this.x * 2; }",
        "}",
        "function id(v) { return v; }",
        'const a = __host.createActor("actor#1", "a");',
        'const p = await __host.ask("ask#1", a, "plan");',
        "const b = { n: id(1) };",
        'const s = ("5");',
        'const t = "7";',
        "const e = E.A;",
        "const ce = CE.X;",
        "const pt = new Point();",
        "function opt(x, y = 2) { return x ?? String(y); }",
        "return { p, b, s, t, e, ce, pt, m: pt.twice, erased: opt(s), decl: id };",
      ),
    );
    // const enum 不被内联，普通 enum 也不做常量折叠：两者都留下运行时对象。
    assert.match(lowered.code, /const e = E\.A;/);
  });

  it("注释三种形态都保留（removeComments: false）", () => {
    const code = codeOf(`
// 顶部注释
const a = agent("a"); /* 块注释 */
const r = await a.ask("x");
/** 文档注释 */
return r;
`);
    assert.equal(
      code,
      body(
        "// 顶部注释",
        'const a = __host.createActor("actor#1", "a"); /* 块注释 */',
        'const r = await __host.ask("ask#1", a, "x");',
        "/** 文档注释 */",
        "return r;",
      ),
    );
  });

  it("原样保留的字面量不转义，lowering 新建的字面量转义成 \\uXXXX", () => {
    assert.equal(
      codeOf(`const a = agent("真实名字");\nphase("  阶段  ");\nawait a.ask("指令内容");`),
      body(
        'const a = __host.createActor("actor#1", "真实名字");',
        '__host.enterPhase("\\u9636\\u6BB5");',
        'await __host.ask("ask#1", a, "指令内容");',
      ),
    );
  });

  it("phase 名去两端空白；名字缺席（非字面量或全空白）退回 void 0 而不是残留自由标识符", () => {
    assert.equal(
      codeOf(`phase("  gate  ");\nconst x: string = "y";\nphase(x);\nphase("   ");`),
      body('__host.enterPhase("gate");', 'const x = "y";', "void 0;", "void 0;"),
    );
  });

  it("嵌套函数、循环体、promise 组合子内部的调用照样成站点", () => {
    const lowered = loweredOf(`
const outer = async () => {
  const inner = agent("inner-a");
  return await inner.ask("nested");
};
const a = agent("a");
const rs = [];
for await (const x of [1, 2]) { rs.push(await a.ask("q" + x)); }
const two = await Promise.all([a.ask("one"), a.ask("two")]);
return { outer, rs, two };
`);
    assert.equal(
      lowered.code,
      body(
        "const outer = async () => {",
        '    const inner = __host.createActor("actor#1", "inner-a");',
        '    return await __host.ask("ask#1", inner, "nested");',
        "};",
        'const a = __host.createActor("actor#2", "a");',
        "const rs = [];",
        "for await (const x of [1, 2]) {",
        '    rs.push(await __host.ask("ask#2", a, "q" + x));',
        "}",
        'const two = await Promise.all([__host.ask("ask#3", a, "one"), __host.ask("ask#4", a, "two")]);',
        "return { outer, rs, two };",
      ),
    );
    assert.deepEqual(lowered.siteIds, ["actor#1", "ask#1", "actor#2", "ask#2", "ask#3", "ask#4"]);
  });

  it("确定性：同一份输入两次降级逐字节相同", () => {
    const script = `
const a = agent("a");
const b = agent("b");
const r = await (Number(args.n) > 0 ? a : b)?.ask("x");
report({ r });
return r;
`;
    const first = lowerWorkflowScript(script);
    const second = lowerWorkflowScript(script);
    assert.equal(first.ok, true);
    assert.equal(second.lowered.code, first.lowered.code);
    assert.deepEqual(second.lowered.siteIds, first.lowered.siteIds);
  });

  it("便捷入口与直接调用 lowerWorkflow 产物相同", () => {
    const script = `const a = agent("a");\nawait a.ask("x");\n`;
    const workflow = createWorkflowProgram(script);
    const direct = lowerWorkflow(workflow, collectSites(workflow));
    const convenience = lowerWorkflowScript(script);
    assert.equal(direct.code, convenience.lowered.code);
    assert.deepEqual(direct.siteIds, convenience.lowered.siteIds);
  });

  it("产物只跑一次 host 调用序列，且 code 里唯一的自由标识符由 harness 绑定", async () => {
    const lowered = loweredOf(`
const a = agent("alice");
phase("读世界");
const files2 = await files.glob("*.ts");
await a.ask("看一下 " + files2.length);
report({ ok: true });
return files2;
`);
    const { calls, host } = makeHost();
    const out = await runLowered(lowered, host);
    assert.deepEqual(out, []);
    assert.deepEqual(calls, [
      ["createActor", "actor#1", "alice"],
      ["enterPhase", "读世界"],
      ["worldRead", "world-read#1", "glob", ["*.ts"]],
      ["ask", "ask#1", "<actor>", "看一下 0"],
      ["report", "report#1", { ok: true }],
    ]);
  });
});

describe("B25 脏脚本不降级", () => {
  it("typecheck 失败：ok=false，lowered 键缺席，诊断行列映射回脚本自身", () => {
    const res = lowerWorkflowScript(`const a = agent("a");\nlog("done", 1);\nawait a.ask("x");`);
    assert.equal(res.ok, false);
    assert.equal("lowered" in res, false);
    assert.deepEqual(Object.keys(res).sort(), ["diagnostics", "ok"]);
    assert.deepEqual(res.diagnostics, [
      { code: 2554, column: 13, line: 2, message: "Expected 1 arguments, but got 2." },
    ]);
  });

  it("facade 引用逃逸 9001：取引用、解构提取、重打类型三种消息形态", () => {
    const reference = lowerWorkflowScript(`const f = agent;\nconst a = f("x");\nawait a.ask("y");`);
    assert.equal(reference.ok, false);
    assert.deepEqual(
      reference.diagnostics.map((d) => [d.code, d.line, d.column, d.message.split(";")[1].trim()]),
      [
        [
          9001,
          1,
          11,
          "taking a reference to it defeats site identity (journal and replay key off call sites)",
        ],
        [
          9001,
          2,
          11,
          "taking a reference to it defeats site identity (journal and replay key off call sites)",
        ],
      ],
    );

    const destructured = lowerWorkflowScript(`
const a = agent("a");
const { ask } = a;
await ask("y");
`);
    assert.deepEqual(
      destructured.diagnostics.map((d) => [d.code, d.line, d.column, d.message]),
      [
        [
          9001,
          3,
          9,
          "facade function 'ask' may only be called directly; taking a reference to it defeats site identity (journal and replay key off call sites)",
        ],
        [
          9001,
          4,
          7,
          "facade function 'ask' may only be called directly; taking a reference to it defeats site identity (journal and replay key off call sites)",
        ],
      ],
    );

    const retyped = lowerWorkflowScript(`
const a = agent("a");
const fake = a as unknown as { ask(i: string): Promise<string> };
const r = await fake.ask("y");
return r;
`);
    assert.deepEqual(retyped.diagnostics, [
      {
        code: 9001,
        column: 14,
        line: 3,
        message:
          "facade function 'ask' may only be called directly; retyping a facade value to a " +
          "structurally-compatible non-facade type escapes site identity " +
          "(the disguised '.ask(...)' resolves to the local type and runs unsited)",
      },
    ]);
  });

  it("计算成员调用与 log / report / files.glob 的引用同样被拦（站点身份不只护 agent）", () => {
    const computed = lowerWorkflowScript(`const a = agent("a");\nawait a["ask"]("y");`);
    assert.deepEqual(
      computed.diagnostics.map((d) => [d.code, d.line, d.column, d.message]),
      [
        [
          9001,
          2,
          7,
          "facade function 'ask' may only be called directly; taking a reference to it defeats site identity (journal and replay key off call sites)",
        ],
      ],
    );

    for (const [script, fnName, column] of [
      [`const l = log;\nl("hi");\nconst a = agent("a");\nawait a.ask("y");`, "log", 11],
      [`const r: (item: unknown) => void = report;\nr({ a: 1 });`, "report", 36],
      [`const g = files.glob;\nconst a = agent("a");\nawait a.ask("y");\nvoid g;`, "glob", 17],
    ]) {
      const res = lowerWorkflowScript(script);
      assert.equal(res.ok, false, fnName);
      assert.deepEqual(
        [res.diagnostics[0].code, res.diagnostics[0].line, res.diagnostics[0].column],
        [9001, 1, column],
        fnName,
      );
      assert.match(res.diagnostics[0].message, new RegExp(`facade function '${fnName}'`));
    }
  });

  it("phase 的名字质量是 analyze 的地盘：lowering 一律放行成 void 0", () => {
    const script = `
const a = agent("a");
const nm: string = "x";
phase(nm);
phase("   ");
phase("");
await a.ask("y");
`;
    const low = lowerWorkflowScript(script);
    assert.equal(low.ok, true);
    assert.deepEqual(low.diagnostics, []);
    assert.equal(
      low.lowered.code,
      body(
        'const a = __host.createActor("actor#1", "a");',
        'const nm = "x";',
        "void 0;",
        "void 0;",
        "void 0;",
        'await __host.ask("ask#1", a, "y");',
      ),
    );
    const ana = analyzeWorkflowScript(script);
    assert.equal(ana.ok, false);
    assert.deepEqual(
      ana.diagnostics.map((d) => [d.code, d.line, d.column]),
      [
        [9004, 4, 7],
        [9004, 5, 7],
        [9004, 6, 7],
      ],
    );
  });
});
