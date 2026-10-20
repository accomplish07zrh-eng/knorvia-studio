// SPDX-License-Identifier: Apache-2.0
// 沙箱子进程逻辑。同一份实现有三种用法：被 renderChildEntry 内嵌进入口文件、
// 由入口文件自启、或由 SEA 隐藏子命令 import 后调它的 start。
//
// 为什么不走 --eval：Windows 命令行上限 32,767 字符，脚本一长就 spawn 失败。
//
// 两层结构：
//   - 外层 realm 是普通 Node 代码，持有 stdio / readline / vm，只做传输；
//   - 求值单元是 vm.createContext 造的独立 realm，只有 ES intrinsics 加一个注入的 __host。
//
// 跨 realm 收敛：脚本触及的一切（Promise、JSON 解析结果、Error）都在 context 内构造；
// 外层与 context 之间只有两种跨界值——一个 __send 函数与入站的行字符串（原始值无 realm 归属）。
// 因此 Array.isArray / instanceof / 原型链在脚本视角下都是 context-native。
//
// 动态 import 在 vm.Script 下没有 importModuleDynamically 回调，运行期 import() 会抛
// ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING；eval / Function 绑定同一套 context 全局。
//
// ⚠ 本文件是 protocol.ts 线协议的手写镜像（入口文件里的 childMain 以内嵌字符串运行，
// 无法 import protocol.ts）。改任一处必须同步另一处：因此 childMain 只允许 import 类型。
import type { ChildMainDeps } from "./child-host-types.js";
import type { ChildPayload } from "./protocol.js";

export type { ChildMainDeps, ChildReadlineInterface, ChildVmModule } from "./child-host-types.js";

/**
 * 沙箱子进程的唯一出口。返回的 promise 在脚本终结（complete 已发出、stdin 已关）后兑现。
 *
 * 为什么必须可 await：SEA 子命令跑在 CLI 进程里，而 CLI 入口在 run() 返回后会挂一个 1 秒退出
 * watchdog；若子进程逻辑只是装好 readline 就同步返回，watchdog 会在 run 刚起步时强退整个进程。
 *
 * ⚠ 自包含约束（载荷性，不是风格）。renderChildEntry 靠 childMain.toString() 把本函数当源码
 * 内嵌，所以函数体必须是一段能独立成立的程序：
 *   1. 只引用参数、语言 intrinsics 与 Buffer 这类 Node 全局，绝不引用模块作用域的任何绑定
 *      （常量、辅助函数、import 都不行）——因此引导脚本与编译辅助都以字面量内联在函数体里。
 *   2. 内层函数一律不许有名字：CLI 的 desktop-agent 构建用 minify + keepNames，会把能推导出
 *      名字的内层函数改写成 __name(fn, "...")，而 __name 是模块作用域的 helper；它一旦进入
 *      toString() 文本，内嵌出的子进程程序就会 ReferenceError，且只在压缩后的发布产物里坏。
 *      成员赋值（sandbox.__send = …）与实参位置的匿名函数不被改写，下面一律用这两种形态。
 */
export function childMain(deps: ChildMainDeps): Promise<void> {
  // 引导脚本：context 内的运行时装配。三种帧走同一条组帧路径，差别只在「要不要等应答」——
  // 单向的（create-actor 与各类事件）发完即返回，双向的（请求）先登记等待者再发。
  // 纯 JS、无反引号与 ${}，因此可以安全内嵌进入口文件。
  const bootstrap = String.raw`
"use strict";
var __counters = { local: 0, request: 0 };
var __awaiting = new Map();
function __merge(target, extra) {
  var keys = Object.keys(extra);
  for (var slot = 0; slot < keys.length; slot += 1) {
    target[keys[slot]] = extra[keys[slot]];
  }
  return target;
}
function __post(kind, fields) {
  __send(JSON.stringify(__merge({ kind: kind }, fields)));
}
// 双向通道：id 在 child 内单调递增，ask / world-read / publish 共用一个计数器。
function __call(type, fields) {
  __counters.request += 1;
  var id = "r" + __counters.request;
  var reply = new Promise(function (resolve, reject) {
    __awaiting.set(id, { resolve: resolve, reject: reject });
  });
  __merge(fields, { kind: "request", id: id, type: type });
  __send(JSON.stringify(fields));
  return reply;
}
// 沙箱实参：在 context 内 JSON.parse 出来的才是 context-native 对象。浅冻结挡住「手滑
// 重新赋值 args」；嵌套对象仍可写，这不是安全边界（实参本来由调用方给）。
var __args = Object.freeze(JSON.parse(String(__argsJson)));
globalThis.__host = {
  args: __args,
  createActor: function (siteId, name, persona) {
    // 同步返回 child-local 句柄并即发即忘；父进程据 FIFO 在引用它的 ask 之前建好映射。
    __counters.local += 1;
    var handle = "local#" + __counters.local;
    __post("create-actor", { localId: handle, siteId: siteId, name: name, persona: persona });
    return handle;
  },
  ask: function (siteId, actor, instructions) {
    return __call("ask", { siteId: siteId, actor: actor, instructions: instructions });
  },
  worldRead: function (siteId, op, args) {
    // 位置实参原样透传：本层不看 op、不校验元数（那是 driver 的职责）。
    return __call("world-read", { siteId: siteId, op: op, args: args });
  },
  publishArtifact: function (siteId, op, args) {
    // 内容产物是效应：脚本 await 它、要能 catch 它的拒绝，所以走双向通道。
    return __call("publish-artifact", { siteId: siteId, artifactOp: op, args: args });
  },
  declareArtifact: function (siteId, op, args) {
    // 预置产物是声明：同步返回 void，走单向通道；它与 report 同一条 FIFO，
    // 于是带标签的 report 必然晚于它的声明到达父进程。
    __post("event", { type: "declare-artifact", siteId: siteId, op: op, args: args });
  },
  report: function (siteId, item, artifactId) {
    // 即发即忘；item 有环时这里的 JSON.stringify 就在调用点上抛，脚本要么 catch 要么失败。
    __post("event", { type: "report", siteId: siteId, item: item, artifactId: artifactId });
  },
  log: function (message) {
    __post("event", { type: "log", message: String(message) });
  },
  enterPhase: function (name) {
    // 阶段标记：无站点、不落 journal，父进程只让引擎发一条事件。
    __post("event", { type: "phase-entered", name: String(name) });
  },
};
// 应答消费：只认 response，未知 id 静默丢弃（重复应答也算未知）。
globalThis.__deliver = function (rawLine) {
  var frame = JSON.parse(rawLine);
  if (frame.kind !== "response") return;
  var waiter = __awaiting.get(frame.id);
  if (!waiter) return;
  __awaiting.delete(frame.id);
  if (frame.ok) {
    waiter.resolve(frame.value);
    return;
  }
  // 拒绝重建为 context-native Error，带上 code / violations / finalText 供脚本结构化处理。
  var wire = frame.error || {};
  var rebuilt = new Error(wire.message || "workflow host error");
  if (wire.name) rebuilt.name = wire.name;
  if (wire.code !== undefined) rebuilt.code = wire.code;
  if (wire.violations !== undefined) rebuilt.violations = wire.violations;
  if (wire.finalText !== undefined) rebuilt.finalText = wire.finalText;
  waiter.reject(rebuilt);
};
// 错误过界形态：Error 取 name/message/stack 与三个结构化字段，其余抛出值统一成 Error。
function __wireOf(cause) {
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
      code: cause.code,
      violations: cause.violations,
      finalText: cause.finalText,
    };
  }
  return { name: "Error", message: String(cause) };
}
// 外层 realm 调用它跑脚本；始终 resolve（错误已转成 complete），便于外层收尾关 stdin。
globalThis.__execute = async function (runFn) {
  try {
    __post("complete", { ok: true, value: await runFn(globalThis.__host) });
  } catch (cause) {
    __post("complete", { ok: false, error: __wireOf(cause) });
  }
};
// 运行期禁令：三个入口都在 context 内拦下，编译期诊断另有一道保险。用子类而不是替换原型，
// 于是 new Date(ms)、Date.parse、Date.UTC 都保留原生行为。
var __clock = Date;
class __GuardedDate extends __clock {
  static now() {
    throw new Error("Date.now() is disabled in workflows");
  }
  static parse(text) {
    return __clock.parse(text);
  }
  static UTC(year, month, ...rest) {
    return __clock.UTC(year, month, ...rest);
  }
  constructor(...params) {
    if (params.length === 0) throw new Error("argless new Date() is disabled in workflows");
    super(...params);
  }
}
globalThis.Date = __GuardedDate;
Object.defineProperty(Math, "random", {
  value: function () {
    throw new Error("Math.random() is disabled in workflows");
  },
  writable: true,
  configurable: true,
});
`;

  // 裸 context 只有 ES intrinsics：注入传输函数与实参 JSON 即可。
  // 实参缺席（内联 run、老 journal 行）编码成 "{}"，`args` 恒有定义是脚本侧的不变式。
  const sandbox = {
    __argsJson: JSON.stringify(deps.payload.args ?? {}),
  } as {
    __send: (line: string) => void;
    __argsJson: string;
    __deliver: (line: string) => void;
    __execute: (runFn: unknown) => Promise<void>;
  };
  sandbox.__send = function (line) {
    deps.stdout.write(line + "\n");
  };
  deps.vm.createContext(sandbox, { name: "workflow-sandbox" });
  deps.vm.runInContext(bootstrap, sandbox, { filename: "workflow-bootstrap.js" });

  // 编译 lowered 函数体（context-native async fn）。语法错误时发一条 error-complete 后返回：
  // 刻意不调 process.exit——写往管道的 stdout 是异步的，立即退出会截断刚发出的 complete
  // （父进程转而只看到「退出而未完成」，丢掉 SyntaxError 明细）。此时没有 reader，冲刷完自然退出。
  let runFn: unknown;
  try {
    runFn = deps.vm.runInContext(`(async (__host) => {\n${deps.payload.lowered}\n})`, sandbox, {
      filename: "workflow-script.js",
    });
  } catch (caught) {
    const detail = caught as { name?: string; message?: string; stack?: string } | undefined;
    const frame = {
      kind: "complete",
      ok: false,
      error: {
        name: detail?.name ?? "SyntaxError",
        message: detail?.message ?? String(caught),
        stack: detail?.stack,
      },
    };
    deps.stdout.write(`${JSON.stringify(frame)}\n`);
    return Promise.resolve();
  }

  // stdin 持有事件循环存活；非空行喂给 context 的 __deliver。
  const reader = deps.createInterface({ input: deps.stdin });
  reader.on("line", function (line: string) {
    if (line.trim()) sandbox.__deliver(line);
  });

  // 跑脚本；无论成败都关 stdin，进程随空闲事件循环自然退出（父进程亦会在 complete 后 kill）。
  return sandbox.__execute(runFn).then(
    function () {
      reader.close();
    },
    function () {
      reader.close();
    },
  );
}

/** runId 里不属于安全字符集的部分一律换下划线；文件名与头注释共用同一份净化。 */
function safeRunId(runId: string): string {
  return runId.replace(/[^A-Za-z0-9._-]/g, "_");
}

/** 入口文件顶部的导入语句：自启路径与 SEA 子命令路径共用同一组能力。 */
const ENTRY_IMPORTS = [
  'import { realpathSync } from "node:fs";',
  'import { createInterface } from "node:readline";',
  'import { fileURLToPath } from "node:url";',
  'import { setFlagsFromString } from "node:v8";',
  'import vm from "node:vm";',
];

/**
 * 入口文件顶层的自启段：堆上限 best-effort + 「我是不是进程入口」判定。
 *
 * 堆上限只在 SEA 自 re-exec 路径有意义——那条路传不了 --max-old-space-size，于是入口文件
 * 在 execArgv 里看不到旗标时自己设一次（V8 对启动期已消费的旗标可能不再理会，记为 SEA 限制）。
 *
 * 自启判定比较 realpath 而不是裸路径：macOS 的 tmpdir 经 /var → /private/var 符号链接，
 * import.meta.url 是解析后的真实路径，裸比较会让子进程静默不启动。
 */
const ENTRY_STARTUP = [
  "const declaredHeapMb = payload.maxOldSpaceSizeMb;",
  'const hasHeapFlag = process.execArgv.some((arg) => arg.startsWith("--max-old-space-size"));',
  'const wantsHeapFlag = typeof declaredHeapMb === "number" && Number.isFinite(declaredHeapMb);',
  "if (wantsHeapFlag && declaredHeapMb > 0 && !hasHeapFlag) {",
  "  try {",
  '    setFlagsFromString("--max-old-space-size=" + Math.trunc(declaredHeapMb));',
  "  } catch {",
  "    // best-effort：V8 对启动期已消费的旗标可能不再理会，失败不得影响 run。",
  "  }",
  "}",
  "",
  "let isProcessEntry = false;",
  "try {",
  "  isProcessEntry =",
  "    process.argv[1] !== undefined &&",
  "    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));",
  "} catch {",
  "  isProcessEntry = false;",
  "}",
  "if (isProcessEntry) {",
  "  void start({ vm, createInterface, stdin: process.stdin, stdout: process.stdout });",
  "}",
];

/**
 * 渲染沙箱入口文件：一份自包含 ESM，harness 写到磁盘后用 `node <entry>` 启动。
 *
 * 内容：payload 作为 JSON 字面量（JSON.stringify 的输出就是合法 JS 表达式）、经 toString()
 * 内嵌的 childMain、导出的 start(deps)，以及自启段。唯一的插值是 childMain 的源文本与
 * payload JSON；生成的顶层代码刻意不用模板字面量，免得与外层的 ${} 打架。
 * 渲染对入参是纯函数：同样的 payload 与 runId 得到同样的文本。
 */
export function renderChildEntry(payload: ChildPayload, meta: { runId: string }): string {
  const sections = [
    [
      `// knorvia dynamic workflow run ${safeRunId(meta.runId)}`,
      "// Generated by @knorvia/dynamic-workflow-runtime before every launch; safe to delete once the run has settled.",
      ...ENTRY_IMPORTS,
      "",
      `export const payload = ${JSON.stringify(payload)};`,
      "",
      `const main = ${childMain.toString()};`,
      "",
      "export const start = (deps) => main({ ...deps, payload });",
      "",
    ],
    ENTRY_STARTUP,
    [""],
  ];
  return sections.map((section) => section.join("\n")).join("\n");
}
