# kernel-dsh-00 接口合同

本包**不替换任何既有模块路径**，只新增两个包内子路径与进程级开关。既有导出、协议字段、环境变量、数据目录一律不变。

## 一、进程级契约

### 1. 环境变量

| 名称                    | 取值                   | 语义               |
| ----------------------- | ---------------------- | ------------------ |
| `KNORVIA_KERNEL_ENGINE` | 缺省 / 任意非 `dsh` 值 | 旧运行时，行为不变 |
| `KNORVIA_KERNEL_ENGINE` | 去首尾空白后恰好 `dsh` | 新运行时           |

- 只对 `app-server` / `agent-server` 生效；其他命令（`version`、`help`、`tui`、`prompt`、`plugins` 等）忽略该变量，行为不变。
- `--prepare-storage` 仍走存储准备，不启动新运行时。
- 不新增其他环境变量；`DSH_HOME` 与 `DSH_TELEMETRY_DISABLED` 是**进程内派生值**，不要求调用方设置。

### 2. stderr 标记

```text
knorvia-kernel-ready engine=dsh dsh=0.2.0-rc.2
knorvia-kernel-failed engine=dsh reason=config|boot|dispose
```

- 单行、UTF-8、`\n` 结尾；stdout 不写任何字节。
- 就绪行只在 boot 成功后写一次；失败行只在失败时写一次。

## 二、`@knorvia/bootstrap/kernel-engine`

源码：`apps/cli/packages/bootstrap/src/kernel/engine.ts`；构建产物：`dist/kernel/engine.js`。该入口**不得**静态或动态 import 任何 `@deepseek-ai/*` 模块，保证默认路径零加载。

```ts
export type KernelEngine = "legacy" | "dsh";

/** 既有变量名；新增取值 dsh。 */
export const KERNEL_ENGINE_ENV = "KNORVIA_KERNEL_ENGINE";
export const KERNEL_ENGINE_DSH = "dsh";

/**
 * 读取引擎选择。去首尾空白后严格等于 "dsh" 才返回 "dsh"，否则 "legacy"。
 * 纯函数，不读 process.env（由调用方传入），不缓存。
 */
export function resolveKernelEngine(
  env: Readonly<Record<string, string | undefined>>,
): KernelEngine;
```

## 三、`@knorvia/bootstrap/kernel`

源码：`apps/cli/packages/bootstrap/src/kernel/*`；构建产物：`dist/kernel/index.js`。该入口可以 import DSH 包，只允许在 `resolveKernelEngine(env) === "dsh"` 时动态 import。

```ts
import type { Context } from "@deepseek-ai/cordis";

export const KERNEL_DSH_VERSION = "0.2.0-rc.2";

export const KERNEL_READY_MARKER = "knorvia-kernel-ready";
export const KERNEL_FAILED_MARKER = "knorvia-kernel-failed";

/** 身份开场，逐字固定（B11）。 */
export const KERNEL_PERSONA_PREFIX: string;

export interface KernelPluginRow {
  readonly id: string;
  readonly name: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly disabled?: boolean;
}

/** v1 固定组合的蓝图（README §三）；顺序即数组顺序。 */
export const KERNEL_PLUGIN_ROWS: readonly KernelPluginRow[];

/**
 * 把 DSH_HOME 注入需要绝对路径的行（当前只有 session-persistence.root），
 * 返回可交给物化器的完整 entry 数组。纯函数，不改蓝图。
 */
export function createKernelPluginRows(dshHome: string): KernelPluginRow[];

export interface KernelLogger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface BootKernelOptions {
  /** 会话工作区；必须是绝对路径。 */
  readonly cwd: string;
  /** 继承环境；缺省 process.env。不会被修改。 */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** 数据根；缺省按 resolveKnorviaDataRoot(env)。 */
  readonly dataRoot?: string;
  /** 裸包名解析基准；缺省为本模块的 import.meta.url。 */
  readonly moduleBaseUrl?: string;
  /** 可选日志；缺省写 stderr。 */
  readonly logger?: KernelLogger;
}

export interface KernelHost {
  readonly engine: "dsh";
  readonly dshVersion: string;
  readonly dshHome: string;
  /** Cordis 根 Context，供 bridge 与测试读取服务；生产入口不暴露给 renderer。 */
  readonly context: Context;
  /** 幂等；第二次返回同一 promise。 */
  dispose(): Promise<void>;
}

/**
 * 启动新运行时。成功返回已 settle 的 host；失败抛错（错误码见下）。
 * 同一进程只允许一个活动 host（B18）。
 */
export function bootKernel(options: BootKernelOptions): Promise<KernelHost>;

export interface RunKernelProcessOptions extends BootKernelOptions {
  readonly input?: NodeJS.ReadableStream;
  readonly output?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
  /** 信号注册器；缺省 process。测试注入以断言注册/清理。 */
  readonly signals?: Pick<NodeJS.Process, "on" | "off">;
}

/**
 * 进程入口：boot → 写就绪行 → 等待 input 结束或信号 → dispose。
 * 返回退出码（0 正常，1 失败）。
 */
export function runKernelProcess(options: RunKernelProcessOptions): Promise<number>;
```

### 错误码

| code                    | 触发                             | 语义                             |
| ----------------------- | -------------------------------- | -------------------------------- |
| `KERNEL_ALREADY_BOOTED` | 第二次 `bootKernel`              | 不创建第二棵树                   |
| `KERNEL_INVALID_CWD`    | `cwd` 非绝对路径                 | 配置错误                         |
| `KERNEL_CONFIG_FAILED`  | 数据根/DSH_HOME/配置文件物化失败 | 配置错误；失败行 `reason=config` |
| `KERNEL_BOOT_FAILED`    | `boot()` 抛错                    | 失败行 `reason=boot`             |
| `KERNEL_DISPOSE_FAILED` | dispose 抛错或超时               | 失败行 `reason=dispose`          |

错误对象至少含 `name`、`message`、`code`；`message` 不含凭据与环境变量值。

## 四、生成物

| 路径                                    | 所有者         | 说明                                                                         |
| --------------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `<DSH_HOME>/knorvia/kernel.cordis.json` | `bootKernel`   | 固定组合的物化文件；每次启动覆盖为确定内容；不是用户配置，不受支持手工编辑。 |
| `<DSH_HOME>/sessions/**`                | DSH 会话持久化 | 新会话日志；本包不写。                                                       |
| `~/.dsh/**`                             | 用户自己的 DSH | 新运行时**不读不写**。                                                       |
| `<数据根>/cli/db/db.sqlite`             | 旧运行时       | 新运行时不写。                                                               |

## 五、兼容面

- 不新增/删除 `@knorvia/bootstrap` 根入口的导出。
- 新增两个 package export：

  ```json
  "./kernel-engine": { "types": "./dist/kernel/engine.d.ts", "import": "./dist/kernel/engine.js" },
  "./kernel": { "types": "./dist/kernel/index.d.ts", "import": "./dist/kernel/index.js" }
  ```

- `@knorvia/cli` 的 `bin`、参数、协议入口、退出码规则不变。
- 后续 `kernel-bridge-01` 只消费 `KernelHost.context` 与 DSH 公开 API，不修改本包导出签名；如需新增，升合同版本。
