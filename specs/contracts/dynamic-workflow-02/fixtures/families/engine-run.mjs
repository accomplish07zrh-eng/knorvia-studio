// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 golden 语料 · engine-run 族：既通过静态检查、又能被沙箱+引擎真实跑完的脚本。
//
// 与 dynamic-workflow-01 的 15 个族不同，这一族不只要求"编译干净"，还要求**运行期有确定结局**：
// 每条样例除脚本外还带一份 drive 表（fake driver 的应答脚本），于是同一次 run 在每个
// 后端调用点上的返回值是钉死的，录制出的事件轨 / journal 行 / 兑现值才可逐字节回放。
//
// drive 表约定（真源在 tests/harness.mjs 的 runEngineSample，两处必须一致）：
//   asks:      { "ask#1": [ {kind:"submit", value} | {kind:"text", text} | {kind:"none"} ] }
//              按**站点 id**归档；一项 = 模型在该站点上的一个动作，按下述时刻依次消耗：
//              派发之后，以及每次 reject / nudge 裁决之后（repair 与 nudge 都在同一次派发上
//              重试，引擎不重新 startAsk——见 B4/B5）。
//              submit=调 submit_result；text=结束本轮并给出末轮文本；
//              none=这个时刻什么都不做（typed 站点上它不会被自动推进：nudge 之后还要有第二项）。
//   world:     { glob: [ {result} | {error} ] }  按 op 名归档的队列，按调用顺序消耗。
//   artifacts: { markdown: [ {record} | {error} ] }  同上，按内容 op 归档。
//   caps:      引擎 caps 覆盖（缺省 { maxConcurrency: 1 }）。
//   args:      运行实参（缺省不给）：一份进 EngineConfig.args（落 RunRecord），
//              一份是递给脚本的 shim 上的 `args`（harness 里恒为冻结对象）。
//              两处都给是生产侧的做法（dynamic-workflow-runtime 的 harness 同样二分）。
//
// 缺席即失败：脚本调用了 drive 表没准备的站点/队列，runEngineSample 一方面让该次效应以
// DriverError 拒绝（于是录制里看得到结局），另一方面把缺备记进 unprepared 并在结束时整体抛错。
// 静默补一个默认值等于把"引擎在这个点上收到了什么"从合同里抹掉。

/** @type {Array<{id: string, script: string, expect: "clean", drive: object}>} */
export const samples = [];

function add(id, script, drive = {}) {
  samples.push({ drive, expect: "clean", id: `engine-run/${id}`, script });
}

// ——— 单个 ask：无类型（末轮文本兑现）与有类型（submit 兑现） ——————————————

add("untyped-ask", 'const a = agent("lead"); return await a.ask("summarise the diff");', {
  asks: { "ask#1": [{ kind: "text", text: "the diff is small" }] },
});

add(
  "typed-ask-accept",
  'interface Summary { summary: string }\nconst a = agent("lead"); return await a.ask<Summary>("summarise");',
  { asks: { "ask#1": [{ kind: "submit", value: { summary: "ok" } }] } },
);

// schema 不合：三次修复用尽 → ValidationFailed → 整个 run errored。
add(
  "typed-ask-invalid",
  'interface Summary { summary: string }\nconst a = agent("lead"); return await a.ask<Summary>("summarise");',
  {
    asks: {
      "ask#1": [
        { kind: "submit", value: { summary: 1 } },
        { kind: "submit", value: { summary: 2 } },
        { kind: "submit", value: { summary: 3 } },
        { kind: "submit", value: { summary: 4 } },
      ],
    },
  },
);

// 有类型却从不 submit：第一次结束轮次只换来一次 nudge（同一次派发上的第二个动作），
// 第二次结束才记 ResultNotSubmitted——两个动作都在 ask#1 这一条队列里按序消耗。
add(
  "typed-ask-never-submits",
  'interface Summary { summary: string }\nconst a = agent("lead"); return await a.ask<Summary>("summarise");',
  {
    asks: {
      "ask#1": [
        { kind: "text", text: "chatter" },
        { kind: "text", text: "still chatter" },
      ],
    },
  },
);

// submit 载荷是 JSON 字符串：解码后校验通过。
add(
  "typed-ask-json-string-payload",
  'interface Summary { summary: string }\nconst a = agent("lead"); return await a.ask<Summary>("summarise");',
  { asks: { "ask#1": [{ kind: "submit", value: '{"summary":"encoded"}' }] } },
);

// ——— 身份与顺序：站点序号、每 actor FIFO、并发闸 ————————————————————

// 同一站点循环三次：三个实例 ask#1@1..@3，各占一个 actor。
add(
  "loop-same-site-three-ordinals",
  'const out = []; for (const k of ["a", "b", "c"]) { out.push(await agent().ask(k)); } return out;',
  {
    asks: {
      "ask#1": [
        { kind: "text", text: "A" },
        { kind: "text", text: "B" },
        { kind: "text", text: "C" },
      ],
    },
  },
);

// 同一 actor 两个 ask：FIFO，第二个的 actorSeq 是 1。
add(
  "same-actor-fifo",
  'const a = agent("lead"); const x = await a.ask("one"); const y = await a.ask("two"); return x + y;',
  {
    asks: {
      "ask#1": [{ kind: "text", text: "1" }],
      "ask#2": [{ kind: "text", text: "2" }],
    },
  },
);

// 四个匿名 actor 扇出，闸开两处：dispatch 交错由引擎决定，事件轨把它钉住。
add(
  "fanout-four-capped-two",
  'const xs = ["a", "b", "c", "d"]; return await Promise.all(xs.map((x) => agent().ask(x)));',
  {
    asks: {
      "ask#1": [
        { kind: "text", text: "a" },
        { kind: "text", text: "b" },
        { kind: "text", text: "c" },
        { kind: "text", text: "d" },
      ],
    },
    caps: { maxConcurrency: 2 },
  },
);

// 循环里写死同一个名字：编译期就诊断（本族要求 clean，故这里用计算名）——
// 运行期两个 actor 抢到同一个计算名 → DuplicateActorName 让 run errored。
// map 的回调必须是 async 的：同步回调在第二个元素上抛，数组就没建成，第一个 ask 的
// promise 成了从没人接的孤儿，run 失败时它一起被拒绝——Node 默认把孤儿拒绝当致命错误，
// 那是样例自己写法造成的浮动 promise，不是引擎行为，不该混进这族的录制里。
add(
  "duplicate-computed-name",
  'const names = ["same", "same"]; return await Promise.all(names.map(async (n) => await agent(n).ask("x")));',
  {
    asks: {
      "ask#1": [
        { kind: "text", text: "x1" },
        { kind: "text", text: "x2" },
      ],
    },
  },
);

// ——— persona：字符串与对象两种写法都归一成 { system } ————————————————

add("persona-string", 'const a = agent("lead", "you lead"); return await a.ask("x");', {
  asks: { "ask#1": [{ kind: "text", text: "done" }] },
});

add("persona-object", 'const a = agent("lead", { system: "you lead" }); return await a.ask("x");', {
  asks: { "ask#1": [{ kind: "text", text: "done" }] },
});

// ——— 世界读取 ————————————————————————————————————————————————

add(
  "world-read-then-branch",
  'const paths = await files.glob("src/**/*.ts"); if (paths.length > 1) { return await agent().ask("two or more"); } return await agent().ask("only one");',
  {
    asks: { "ask#1": [{ kind: "text", text: "many" }] },
    world: { glob: [{ result: ["src/a.ts", "src/b.ts"] }] },
  },
);

// 世界读失败被脚本 catch：节点级拒绝走可 catch 通道，run 照常完成。
add(
  "world-read-error-caught",
  'let fallback = 0; try { await files.read("missing.ts"); } catch { fallback = 1; } return { fallback };',
  { world: { read: [{ error: "no such file" }] } },
);

// 世界读失败没被 catch：错误沿脚本上抛，run 以脚本失败收束。
add(
  "world-read-error-uncaught",
  'const text = await files.read("missing.ts"); return text.length;',
  { world: { read: [{ error: "no such file" }] } },
);

// 多个 op 混排：git-status 无参、grep 两参，实参数组原样透传给 driver。
add(
  "world-read-multi-op",
  'const st = await git.status(); const hits = await files.grep("TODO", "src/**"); const changed = await git.changedFiles("main"); return { branch: st.branch ?? "none", hits: hits.length, changed: changed.length };',
  {
    world: {
      "git-status": [
        { result: { clean: false, staged: [], untracked: ["x.ts"], branch: "feature" } },
      ],
      grep: [{ result: [{ path: "a.ts", line: 1, text: "// TODO" }] }],
      "git-changed-files": [{ result: ["a.ts", "b.ts"] }],
    },
  },
);

// ——— report ————————————————————————————————————————————————

add(
  "report-two-items",
  'const a = agent("lead"); await a.ask("work"); report({ n: 1 }); report({ n: 2 }); return "done";',
  { asks: { "ask#1": [{ kind: "text", text: "ok" }] } },
);

add(
  "report-tagged-preset",
  'artifact.table("dash", { columns: [{ field: "n" }] }); report({ n: 1 }, "dash"); return "ok";',
  {},
);

// ——— 产物 ————————————————————————————————————————————————

add(
  "artifact-markdown-publish",
  'const ref = await artifact.markdown("notes", "# hi"); return ref;',
  { artifacts: { markdown: [{ record: { id: "notes", version: 1 } }] } },
);

// 内容产物失败被 catch：这是 facade 明确推荐的写法。
add(
  "artifact-file-error-caught",
  'let published = false; try { await artifact.file("pdf", "out/missing.pdf"); published = true; } catch { published = false; } return { published };',
  { artifacts: { file: [{ error: "not a file" }] } },
);

// 预置声明在类型面上合法、在引擎的 spec 校验里非法（空 series 数组）：void 家族没有拒绝
// 通道 → failRun。
add(
  "artifact-preset-bad-spec",
  'artifact.chart("c", { x: { field: "a" }, y: [] }); report({ a: 1 }, "c"); return "unreachable";',
  {},
);

// ——— 阶段标记与 log：无站点、无 journal 行，但要有事件 ——————————————————

add(
  "phase-markers-and-log",
  'phase("gather"); const a = agent("lead"); log("created"); await a.ask("one"); phase("check"); await a.ask("two"); return "done";',
  {
    asks: {
      "ask#1": [{ kind: "text", text: "1" }],
      "ask#2": [{ kind: "text", text: "2" }],
    },
  },
);

// 同名阶段重复出现 = 同一个阶段：两次 enterPhase 用同一个名字。
add(
  "phase-name-repeated",
  'phase("loop"); const xs = [1, 2]; for (const x of xs) { await agent().ask(String(x)); phase("loop"); } return "done";',
  {
    asks: {
      "ask#1": [
        { kind: "text", text: "A" },
        { kind: "text", text: "B" },
      ],
    },
  },
);

// ——— args：唯一按标识符改写的 facade 值 ——————————————————————————————

// 实参从 drive.args 进 shim（生产侧同一条不变式：facade 声明 `args` **恒有定义**，
// 于是 args.target 是普通属性读而不是崩一场），同时经 EngineConfig 落 RunRecord。
add(
  "args-read",
  'return { target: String(args.target ?? "none"), keys: Object.keys(args).sort() };',
  { args: { limit: 3, target: "src/a.ts" } },
);

// 没给实参时 `args` 仍是空对象：内联 run 与老 journal 行都按这条走（child shim 编码 "{}"）。
add(
  "args-absent-is-empty-object",
  "return { type: typeof args, keys: Object.keys(args).length, missingIsUndefined: args.nope === undefined };",
  {},
);

// ——— 嵌套异步辅助：站点在函数体内，序号仍按执行顺序 ——————————————————

add(
  "async-helper-keeps-ordinals",
  'const a = agent("lead"); async function step(word: string) { return await a.ask(word); } const x = await step("one"); const y = await step("two"); return x + y;',
  {
    asks: {
      "ask#1": [
        { kind: "text", text: "1" },
        { kind: "text", text: "2" },
      ],
    },
  },
);

// ——— 混合全景：actor × 世界读 × typed ask × report × 产物 ——————————————

add(
  "combined-run",
  'interface Findings { items: string[] }\nphase("survey");\nconst lead = agent("lead", { system: "you lead" });\nconst paths = await files.glob("src/**/*.ts");\nreport({ count: paths.length });\nphase("review");\nconst found = await lead.ask<Findings>("review " + paths[0]);\nconst ref = await artifact.markdown("report", "# " + found.items.join(", "));\nreturn { found, ref };',
  {
    asks: { "ask#1": [{ kind: "submit", value: { items: ["a", "b"] } }] },
    artifacts: { markdown: [{ record: { id: "report", version: 1 } }] },
    world: { glob: [{ result: ["src/a.ts"] }] },
  },
);
