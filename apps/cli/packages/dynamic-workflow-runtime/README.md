# @knorvia/dynamic-workflow-runtime

动态工作流的沙箱执行层：在受控子进程里跑一份 workflow 脚本，用 NDJSON 把沙箱里的 `__host.*`
调用桥接到 `@knorvia/dynamic-workflow` 的引擎核。

## 依赖边界

只依赖 `@knorvia/dynamic-workflow`（workspace）与 node 内建。刻意不 import `@knorvia/core`、
`@knorvia/contracts`、`@knorvia/bootstrap`、`@knorvia/adapters`：本包是「沙箱到引擎这条管线不依赖
应用层也能跑」的证明，加了任何一条就是破坏这个证明。

## 用法

```ts
import { runWorkflowScript } from "@knorvia/dynamic-workflow-runtime";

const settlement = await runWorkflowScript({
  scriptText, // 作者原文；也可给 lowered（已降级的 async 函数体），后者优先
  caps: { maxConcurrency: 16 },
  askSpecs, // 每个 ask 站点的静态规格
  validate, // schema 校验器，由调用方注入
  makeDriver: (sink) => driver, // driver 自带 journal 与 emit；sink 是引擎的向上回报面
  signal, // 可选：外部取消
  timeoutMs, // 可选：墙钟上限
});
// settlement 三态：completed（带 artifact）/ errored（带 error）/ stopped（带 reason）
```

## 模块划分

| 文件                  | 职责                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `harness.ts`          | 编排入口：定执行体、建引擎、起沙箱、交给监督                     |
| `sandbox-launch.ts`   | 写入口文件并 spawn；启动期故障归一到引擎结算                     |
| `run-supervision.ts`  | 收尾闸门：四个终结来源收敛成一个结算，并清理句柄                 |
| `child-bridge.ts`     | child → parent 的消息分派（事件同步、请求异步应答）              |
| `child-source.ts`     | 沙箱子进程逻辑与入口文件渲染（`childMain` / `renderChildEntry`） |
| `child-entry-file.ts` | 入口文件落盘：先项目目录、再系统临时目录                         |
| `protocol.ts`         | 线协议形状（唯一真源；沙箱侧有一份手写镜像）                     |
| `*-types.ts`          | 各模块的冻结形状与运行期接线类型                                 |

## 执行流程

```
┌─ 父进程 ────────────────────────────┐  NDJSON  ┌─ 子进程（vm.createContext）──────┐
│ runWorkflowScript                   │  stdio   │ 只有 ES intrinsics + __host      │
│  lower(scriptText) 或直接用 lowered │◀────────▶│ createActor 同步返回 local 句柄  │
│  WorkflowEngine(driver, …)          │          │ ask/worldRead → 请求父进程       │
│  把 __host.* 桥到引擎               │          │ args 冻结全局（启动时过界一次）  │
│  spawn / kill / 超时 / abort        │          │ Date.now / Math.random 禁令      │
└─────────────────────────────────────┘          └──────────────────────────────────┘
```

## 构建顺序

测试与 typecheck 通过 `@knorvia/dynamic-workflow` 的**已构建 dist** 解析依赖，因此 `pretypecheck`
会先构建它。全新检出直接 `pnpm test` 即可，不会踩到 stale dist。

## 失败语义

run 的裁决归引擎所有，harness 不自造结算。两类失败分开归一：

| 来源                                                            | 结算                              |
| --------------------------------------------------------------- | --------------------------------- |
| 脚本抛错（沙箱发出 `complete(ok:false)`）                       | `errored`，错误码 `DriverError`   |
| 宿主侧故障（spawn 失败、崩溃、协议损坏、墙钟超时）              | `stopped(interrupted)`，可 resume |
| abort 信号（`user` / `model` / `{superseded}` / `interrupted`） | `stopped(<initiator>)`            |

harness 侧的 first-wins 只管子进程清理（清 timer、摘监听、关 reader、kill child）。
