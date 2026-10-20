# kernel-bridge-legacy 接口合同

本包**不新增公开模块路径**、不改协议字段。接口 = 既有旧协议进程面与消息面在新引擎上的等价实现，加上一个**包内冻结的注册面**（执行端口 / 反向请求），供 `kernel-bridge-02/03` 在组合根接线。

依赖方向固定：**`kernel-bridge-02/03` → 本包**，本包不得 import 它们。

## 一、进程契约

| 项       | 契约                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| 启动     | `knorvia app-server --stdio`；`agent-server --stdio` 同一入口                                     |
| 引擎     | `KNORVIA_KERNEL_ENGINE` 去首尾空白后严格等于 `dsh` 走新实现；缺省/空/其他值保持旧运行时逐字节不变 |
| stdout   | 只写 UTF-8 NDJSON 协议行，每行 `\n`；不混日志或就绪标记                                           |
| stderr   | 日志与就绪标记（`knorvia-kernel-ready engine=dsh dsh=<ver>`）；不承载协议消息                     |
| stdin    | 逐行读取；EOF 触发收尾                                                                            |
| 退出     | EOF/SIGTERM 后释放并退出 0；启动或桥初始化失败退出 1                                              |
| 单实例   | 每个进程只启动一个 DSH host；不启动第二个 Cordis 树或第二个 agent loop                            |
| 默认路径 | 无 `dsh` 开关时不加载任何 `@deepseek-ai/*`                                                        |

## 二、消息外壳

（与 `kernel-bridge-01` interface.md §二 相同，本包不重复定义，只引用）

```text
request       {"id": <string|number>, "method": <string>, "params"?: <any>, "trace"?: <object>}
response      {"id": <string|number>, "result": <any>}
error         {"id": <string|number>, "error": {"code": <int>, "message": <string>, "data"?: <any>}}
notification  {"method": <string>, "params"?: <any>, "trace"?: <object>}
```

- 全部 strict：不接受未知键；带 `jsonrpc` 字段被拒（`-32600`）。
- server → client 的反向 request 沿用同一外壳，客户端必须应答。
- 反向 request 的 id 用 `server-<n>` 前缀，与客户端 id 空间分离。

## 三、方法面（冻结）

74 个方法名与参数/结果 schema 由 `@knorvia/shared` 冻结，本包**不改名、不增删字段**。按方向分三类（清单见 [README.md](README.md) §二 与 `fixtures/request-script.mjs`）：

| 方向                        | 数量 | 要求                                       |
| --------------------------- | ---- | ------------------------------------------ |
| 客户端 → CLI                | 59   | 必须被应答；不落 `-32601`                  |
| CLI → Host 反向请求         | 14   | 由 CLI 主动发起；客户端反向发来 → `-32601` |
| CLI → Host 通知（借方法名） | 1    | `computer-use/operation-event`             |

错误码族（不新增、不改写）：`-32700/-32600/-32601/-32602/-32603` 与 `-32003/-32004/-32009/-32010/-32018/-32020/-32021/-32022/-32031`。

## 四、包内注册面（供 02/03 接线；本包冻结）

以下符号从 `apps/cli/packages/bootstrap/src/kernel-bridge/legacy/index.ts`（实现阶段新建）导出，**仅供 bootstrap 组合根与测试使用**，不进入 `@knorvia/bootstrap` 根入口，不进入 `@knorvia/shared`。

```ts
import type { Context } from "@deepseek-ai/cordis";

/** 旧协议方法的执行结果：result 或既有协议错误。 */
export type LegacyMethodOutcome =
  | { readonly kind: "result"; readonly result: unknown }
  | {
      readonly kind: "error";
      /** 既有错误码族；不得新增。 */
      readonly code: number;
      readonly message: string;
      readonly data?: unknown;
    };

/** 执行端口收到的请求（已通过参数 schema 校验）。 */
export interface LegacyExecutionRequest {
  readonly method: string;
  readonly params: unknown;
  /** 调用方 trace（客户端 request.trace 原样透传）。 */
  readonly trace?: Readonly<Record<string, unknown>>;
}

/**
 * 回合类方法的执行端口。由 kernel-bridge-02/03 在组合根注册。
 * 未注册的方法由本包按 capability 缺席语义返回（behavior B10）。
 */
export interface LegacyExecutionPort {
  /**
   * 执行一个回合类方法。抛错表示内部失败（桥折叠为 -32603），
   * 返回 {kind:"error"} 表示业务错误（桥原样透传）。
   */
  execute(request: LegacyExecutionRequest): Promise<LegacyMethodOutcome>;
}

/** 注册执行端口；返回解绑函数。重复注册抛错（唯一所有者）。 */
export function registerLegacyExecutionPort(port: LegacyExecutionPort): () => void;

/**
 * 桥的 legacy 路由入口：返回 undefined 表示「不是旧协议方法」，
 * 调用方（entry.ts 的 route default 分支）继续按原逻辑处理。
 */
export function routeLegacyMethod(
  context: Context,
  method: string,
  params: unknown,
  trace?: Readonly<Record<string, unknown>>,
): Promise<LegacyMethodOutcome | undefined>;

/** 反向请求端口：向 Host 发起反向 request（含 signal / 超时 / 重发现语义）。 */
export interface LegacyHostRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly reannounceIntervalMs?: number;
  readonly trace?: Readonly<Record<string, unknown>>;
}

export interface LegacyHostChannel {
  request<T>(
    method: string,
    params: unknown,
    resultSchema: { parse(value: unknown): T },
    options?: LegacyHostRequestOptions,
  ): Promise<T>;
  notify(method: string, params: unknown, trace?: Readonly<Record<string, unknown>>): void;
}

/** 桥创建 Host 通道后交给 `routeLegacyMethod` 的实现（内部注入，不对外）。 */
```

**注册面约束**：

1. `registerLegacyExecutionPort` 只允许调用一次；第二次抛错（单一所有者）。
2. 端口注册是启动期动作；运行期不动态增删。
3. 本包**不 import** `kernel-bridge-02/03` 的任何模块；注册由组合根完成。
4. 端口未注册时，回合类方法按 behavior B10 返回 capability 缺席；这是**临时态**，登记在 [known-differences.md](known-differences.md)。

### 端口接收的是「旧协议方法语义」，不是 v4 命令名（2026-10-20 补充，C2 准入判定依据）

执行端口收的 `LegacyExecutionRequest.method` 是**旧协议方法字面量**，语义也是旧协议语义。
`kernel-bridge-02/03` 的职责是「v4 命令 → 旧协议语义」的映射，**不得**把 v4 命令名透传到端口。

端口方法清单（11 个，字面量与 `@knorvia/shared` 的 `knorviaProtocolMethods` 一致）：

```text
session/resume
session/subscribe
session/send
session/stop
session/cancelBackgroundTask
session/compact
session/fork
session/goal
session/setModel
session/setThoughtLevel
session/setMode
session/close
```

**不接受自造名**。特别地：v4 的 `stop` 对应端口的 `session/stop`；v4 的 steer 是 `sendText` 的
`guide` 投递模式，对应端口的 `session/send`——**不存在** `cancelTurn`、`steer`、`sendText` 这类端口方法名。
端口实现方若收到清单外的名字，应按内部失败处理（桥会折叠为既有 `-32603`），不得静默改写。

**调用顺序也是冻结面**：参数校验（`-32602`）→ 会话存在性（`-32004`）→ 端口注册检查（`-32031`）→ 交端口执行。
理由见 [known-differences.md](known-differences.md) D9：顺序颠倒会让 Host 把「会话不存在」误读成「功能永久缺失」。

## 五、`entry.ts` 的唯一改动点

实现阶段在 `apps/cli/packages/bootstrap/src/kernel-bridge/entry.ts` 的 `route()` **default 分支**加一处委派：

```ts
default: {
  // 旧协议方法由 legacy 路由器处理；不是旧协议方法时返回 undefined 继续原逻辑。
  const legacy = await routeLegacyMethod(options.context, method, params);
  if (legacy !== undefined) {
    if (legacy.kind === "error") {
      throw new BridgeProtocolError(legacy.code, legacy.message, legacy.data);
    }
    return legacy.result;
  }
  throw new BridgeProtocolError(JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
}
```

- 只此一处；不改 `V4_METHODS` 分支、不动 `handleLine`/`handleRequest`/`writeMessage`。
- 该 hunk 归本包（Lead 2026-10-20 裁决）；`kernel-bridge-02/03` 只扩自己的方法注册表，不动 default 分支。

## 六、旧协议方法到执行端口的映射义务（实现阶段）

1. **参数校验**：每个方法先用 `@knorvia/shared` 的既有 schema 校验参数；失败回 `-32602` + 既有 `Invalid params — <path>: <原因>` 文案结构。
2. **会话存在性**：会话类方法先查会话登记表；不存在按该方法的既有语义回 `-32004`。
3. **结果形状**：返回前用既有 result schema 校验一次，结构性错误在开发期立刻暴露，不在运行时静默改写。
4. **回合类方法**：转给执行端口；未注册 → B10。
5. **通知**：由桥自己的发射器发出，不经 Host 转手；每个通知名必须有唯一触发点（behavior B14）。
6. **反向请求**：`interaction/*`、`session/requestRuntimePreferences`、`automation/*`、`offPeak/*` 由 CLI 侧发起；桥只提供 `LegacyHostChannel`，不替 Host 决定内容。
7. **凭据**：`requestProviderRuntimeHeaders` 的结果只用于本次模型请求；不进日志、不进夹具。

## 七、兼容面

- 不新增/删除 `@knorvia/bootstrap` 根入口的导出；不新增 `@knorvia/cli` bin 或参数。
- 不新增环境变量；引擎只用 `KNORVIA_KERNEL_ENGINE`。测试专用 `KNORVIA_BRIDGE_ENTRY` 只存在于桩门运行器进程。
- 不改 `packages/shared/src/protocol/**` 与 `protocol-v4/**` 的任何字段、schema、常量、导出。
- 不改旧数据目录、旧会话库、`.knorvia-studio`、凭据位置。
- 桥内部模块路径由实现决定；若新增包内导出，只供组合根与测试使用，并在实现 PR 的 interface 变更说明中列出。
