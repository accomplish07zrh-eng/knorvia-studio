# kernel-bridge-02 接口合同

本包**不新增公开模块路径**、不改协议字段。接口 = 「v4 回合命令到 DSH 会话操作」的映射面，加上一个**包内注册面**（供组合根把 legacy 执行端口接上）。

依赖方向固定：**本包 → `kernel-bridge-01`、`kernel-bridge-legacy`**。反向不成立。

## 一、进程契约

与 `kernel-bridge-01` interface.md §一 相同（本包不重复定义，只引用）：`knorvia app-server --stdio`、NDJSON 外壳、单实例、默认路径不加载 `@deepseek-ai/*`。本包不改变其中任何一项。

## 二、消息外壳（冻结，不改）

```text
request       {"id": <string|number>, "method": <string>, "params"?: <any>, "trace"?: <object>}
response      {"id": <string|number>, "result": <any>}
error         {"id": <string|number>, "error": {"code": <int>, "message": <string>, "data"?: <any>}}
notification  {"method": <string>, "params"?: <any>, "trace"?: <object>}
```

本包不新增方法名、不改错误码族、不改帧结构。v4 方法仍只有 `kernel-bridge-01` 已接的六个 + 本包不新增（回合全部走 `v4/command` 的类型分派）。

## 三、本包补充的命令类型（语义面）

`v4/command` 的 `type` 与 payload 形状由 `packages/shared/src/protocol-v4/command.ts` 的 `commandPayloadSchemas` 冻结（实测 34 个命令）。本包负责让下列 **5 个**从 `unsupported` 变为真实执行：

```ts
/**
 * 本包承诺实现的 v4 命令字面量（权威来源：commandPayloadSchemas）。
 * 不存在的名字：cancelTurn（取消是 stop）、steer（是 sendText.requestedDelivery === "guide"）。
 */
type KernelBridge02CommandType =
  | "createSession" // payload.firstInput 的投递（B3）
  | "sendText" // B2/B4/B5；requestedDelivery: "startNow" | "queue" | "guide"
  | "stop" // B6；payload 只有 expectedForegroundExecutionId
  | "compact" // B7b；输入型维护，可排队
  | "resolveInteraction"; // B9/B10；审批/交互应答

/** sendText 的交付意愿；admission 后的裁决见 inputRouting.mode。 */
type RequestedDelivery = "startNow" | "queue" | "guide";

/** held 状态下的队列处置意图（inputRouting.mode === "choice" 时必带）。 */
type HeldQueueDisposition = "clearQueueAndSend" | "keepQueueAndSend";
```

- `createSession` 的建会话已由 `kernel-bridge-01` 实现；本包补 `firstInput` 的投递与原子性。
- `sendText`、`stop`、`compact`、`resolveInteraction` 由本包从零实现（B1、B2、B4–B7、B9）。
- **不新增命令字面量**；其余 29 个命令仍由 `kernel-bridge-03` 补齐。

## 四、包内注册面（供组合根接线；本包冻结）

以下符号从 `apps/cli/packages/bootstrap/src/kernel-bridge/legacy-port/index.ts`（实现阶段新建）导出，**仅供 bootstrap 组合根与测试使用**，不进入 `@knorvia/bootstrap` 根入口，不进入 `@knorvia/shared`。

````ts
import type { Context } from "@deepseek-ai/cordis";
import type { LegacyExecutionPort } from "../legacy/index.js";

/**
 * 造一个回合类方法的执行端口：把旧协议的 method + params 映射到与 v4 命令相同的执行实现。
 * 组合根在启动期把它交给 `registerLegacyExecutionPort`（kernel-bridge-legacy 的注册面）。
 *
 * @param context - DSH 根 context（回合执行需要它）。
 * @param engine - 已经建好的桥引擎（与 v4 路径共用同一个实例）。
 * @returns 可注册的执行端口；`execute()` 按 legacy 的 outcome 形状返回。
 */
export function createLegacyTurnPort(
  context: Context,
  engine: KernelTurnExecutor,
): LegacyExecutionPort;

/**
 * 本包对「执行一个回合动作」的最小抽象。v4 命令分派与 legacy 执行端口
 * 都调用它，保证两条路径共用同一实现（B14 的 C2 准入项）。
 */
export interface KernelTurnExecutor {
  /** 投递一条用户输入（v4 sendText 与旧协议 session/send 的共同实现）。 */
  sendText(request: TurnSendRequest): Promise<TurnSendResult>;
  /** 停止当前回合（v4 stop 与旧协议 session/stop 的共同实现）。 */
  stop(request: TurnStopRequest): Promise<TurnStopResult>;
  /** 输入型维护压缩（v4 compact 与旧协议 session/compact 的共同实现）。 */
  compact(request: TurnCompactRequest): Promise<TurnCompactResult>;
  /** 建会话并可选投递首条输入（B3）。 */
  createSession(request: TurnCreateRequest): Promise<TurnCreateResult>;
}

/** v4 与旧协议共用的一次投递请求；字段取自各自的入参，语义归一。 */
export interface TurnSendRequest {
  readonly sessionId: string;
  readonly text: string;
  /** 交付意愿；`guide` 即 steer。缺省按 `inputRouting` 裁决。 */
  readonly requestedDelivery?: RequestedDelivery;
  /** held 状态下的队列处置；`inputRouting.mode === "choice"` 时必带。 */
  readonly heldQueueDisposition?: HeldQueueDisposition;
  /** held 处置前用户看到过的队列项；用于拒绝「处置没确认过的新项」。 */
  readonly expectedHeldQueueItemIds?: readonly string[];
  readonly trace?: Readonly<Record<string, unknown>>;
}

export interface TurnSendResult {
  readonly sessionId: string;
  /** 实际裁决结果（`startNow` / `queue` / `guide`）。 */
  readonly admitted: "startNow" | "queue" | "guide";
  /** 排队位置；取自意图的 `order.queuePosition`，不排队时为 0。 */
  readonly queuePosition: number;
}

/** 停止当前回合。 */
export interface TurnStopRequest {
  readonly sessionId: string;
  /** 迟到的 Stop 用它比对当前前台执行；不匹配即过期命令（B6）。 */
  readonly expectedForegroundExecutionId?: string;
  readonly trace?: Readonly<Record<string, unknown>>;
}

export interface TurnStopResult {
  readonly sessionId: string;
  /** 是否真的停止了某个回合；无活动回合时为 false。 */
  readonly stopped: boolean;
}```

**注册面约束**：

1. `createLegacyTurnPort` 只造端口、不做注册；注册由组合根调用 legacy 的 `registerLegacyExecutionPort`（legacy 才是端口注册表的唯一所有者）。
2. 本包**不 import** `kernel-bridge-legacy` 的实现模块，只 import 其**类型**（`LegacyExecutionPort` / `LegacyMethodOutcome`）——这些类型从 legacy 的 `interface.md` §四 冻结面导出。
3. `engine` 必须是已建好的同一个桥引擎：v4 路径与 legacy 路径共用它，不得各造一个（B14、B15）。
4. 端口注册是启动期动作；运行期不动态增删。

## 五、与 `entry.ts` 的边界（不改）

- `entry.ts` 的 `route()` **六个已接 v4 方法不动**；`default` 分支归 `kernel-bridge-legacy`（其 interface.md §五 的 hunk 归它）。
- 本包**不新增 v4 方法名**，回合能力全部经 `v4/command` 的 `type` 分派。
- 本包只在 `bridge-engine.ts` 的 `execute()` switch 内补齐分支，并新增回合推进与审批交互的内部模块。

## 六、回合帧接口（只引用，不重定义）

v4 帧的 `kind`、字段、`wireVersion`、`topic`/`subscriptionId`/`deliveryKind`/`fromSeq` 全部由 `@knorvia/shared/protocol-v4` 冻结，`kernel-bridge-01` 的 `ProjectionLayer` 已实现投递。本包只**新增事件 → 帧的派生规则**（assistant 行、tool 行、`TurnComplete`），不新增帧类型、不改字段。

## 七、离线回合驱动的探针 seam（测试用，公开 API）

`@deepseek-ai/dsh-llm` 导出抽象类 `LlmAdapter` 与 `ctx.llm.registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle`。测试 harness 用它注册一个返回固定帧的假 provider，从而**离线确定性驱动真实 agent loop**：

```ts
// 仅测试使用（specs/contracts/kernel-bridge-02/tests/_fake-provider.mjs），不进产品代码。
registerFakeProvider(ctx: Context, options: { readonly reply: string }): () => void;
````

- 这是 DSH 公开接口（`dsh-llm-pi-ai` 走同一条），**不 fork、不改 DSH 源码**。
- 假 provider 只用于契约测试，不进入组合行、不进入产品运行时。
- 若该 seam 因 SDK 细节不可用，降级为「不依赖模型的确定性回合」（`compact`、`stop`、空回合帧）并把真实模型回合登记为暂缓验证（见 README §八之二）。

## 八、兼容面

- 不新增/删除 `@knorvia/bootstrap` 根入口的导出。
- 不新增 `@knorvia/cli` bin 或参数；不新增环境变量（引擎只用 `KNORVIA_KERNEL_ENGINE`）。
- 不改 `packages/shared/src/protocol/**` 与 `protocol-v4/**` 的任何字段、schema、常量、导出。
- 不改 `.knorvia-studio` 数据目录、旧会话库、旧协议方法、凭据位置。
- 桥内部模块路径由实现决定；若新增包内导出，只供组合根与测试使用，并在实现 PR 的 interface 变更说明中列出。
