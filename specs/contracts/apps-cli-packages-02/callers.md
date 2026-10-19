# apps-cli-packages-02 调用方（callers.md）

## 方法

`pnpm dep:refs` 对 `apps/cli` 五个包的源码路径不可用（报告「源文件未加载到 project」）。
改用两种等价方法交叉核对（命令均在仓库根目录、Node 24）：

1. **导出面**：`tools/extract-interface.mjs` 用 TypeScript 编译器 API 逐字提取 22 个源码模块的
   导出签名，结果在 [interface.md](./interface.md)；
2. **调用方**：全仓 import 检索，逐条核对是产品代码、测试还是证据工件：

```text
rg -n 'from "@knorvia/(dynamic-workflow-runtime|i18n|telemetry|shared-types|node-repl-host)[^"]*"'
rg -n 'from "(\./|\.\./).*" apps/cli/packages/<pkg>/src
```

## 公开入口（兼容面）

| 包                                  | 入口                                                                                                              | 形态                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `@knorvia/dynamic-workflow-runtime` | `.` → `dist/index.js` / `dist/index.d.ts`                                                                         | 5 个运行期导出 + 协议类型                                    |
| `@knorvia/i18n`                     | `.` → `dist/index.js` / `dist/index.d.ts`                                                                         | `getKnorviaCopy` 与语言工具                                  |
| `@knorvia/telemetry`                | `.` → `dist/index.js` / `dist/index.d.ts`                                                                         | 5 个内部模块的桶面；`otlp-exporter` **不在**桶面（延迟加载） |
| `@knorvia/shared-types`             | `.` → `dist/index.js` / `dist/index.d.ts`                                                                         | 纯类型；运行期导出为空                                       |
| `@knorvia/node-repl-host`           | `.`/`./cua-bridge`/`./browser-bridge`/`./cua-broker`/`./result`/`./tool-contract`/`./runtime-bridge` → `src/*.ts` | 直接发布源码；构建另产出 `dist/mcp/server.js` bundle         |

`node-repl-host` 的 `exports` 直接指向 `src/*.ts`，因此 dist 模式没有逐模块镜像（见
`known-differences.md` §四）。本包只锁 `./tool-contract` 与清单；其余子路径属于 #197 与既有
独立实现的范围。

## 跨包调用方（产品代码）

### dynamic-workflow-runtime

| 调用方                                                  | 引入的名字                                                |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `bootstrap/src/app/dynamic-workflow-run-launch.ts`      | `runWorkflowScript`                                       |
| `bootstrap/src/app/dynamic-workflow-snippet-service.ts` | `runWorkflowScript`                                       |
| `cli/src/dwf-child-command.ts`                          | 无 import（SEA 子命令只 `import()` 入口文件并调 `start`） |

`bootstrap/src/app/dynamic-workflow-run-launch.ts` 是唯一的生产启动路径；`caps`、`askSpecs`、
`makeDriver` 由 bootstrap 注入，runtime 自身不 import core/contracts/bootstrap/adapters。

### i18n

| 调用方                                                   | 引入的名字                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `tui/src/app-locale.ts`、`tui/src/app*.tsx/ts`（多文件） | `getKnorviaCopy`                                               |
| `cli/src/locale.ts`                                      | `detectLocale`、`resolveLocale`、`SupportedLocale`、`UiLocale` |
| `cli/src/help.ts`                                        | `getKnorviaCopy`、`SupportedLocale`、`UiLocale`                |
| `cli/src/run.ts`                                         | `getKnorviaCopy`、`isUiLocale`、`UiLocale`                     |
| `cli/src/tui-startup-locale.ts`                          | `resolveLocale`、`SupportedLocale`                             |
| `cli/src/tui-prompt-handler.ts`                          | `DEFAULT_LOCALE`、`SupportedLocale`                            |
| `cli/src/command-center/handlers/locale.ts`              | `isUiLocale`、`SUPPORTED_LOCALES`、`UiLocale`                  |

`SUPPORTED_LOCALES`、`isSupportedLocale` 还被 CLI 参数解析与测试引用；目录对象只经
`getKnorviaCopy` 读取，调用方不直接 import `locales/en-US` / `locales/zh-CN`。

### telemetry

| 调用方                                      | 引入的名字                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bootstrap/src/telemetry-bootstrap.ts`      | `prepareModelTelemetryEnv`、`shutdownPreparedModelTelemetry`、`PrepareModelTelemetryOptions` |
| `bootstrap/src/protocol/runtime-cleanup.ts` | `shutdownPreparedModelTelemetry`                                                             |
| `bootstrap/src/app/create-app.ts`           | `createModelTelemetry`                                                                       |

`createModelTelemetry` 只在同步 App 工厂里借用已准备的进程 Owner；`statusSink` 由 App 接到模型
状态 fan-out。`otlp-exporter` 仅由 `prepareModelTelemetryEnv` 在启用时动态 `import()`。

### shared-types

全部是 `import type`，没有运行期调用方。主要消费者：

| 调用方                                                                     | 引入的名字                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------- |
| `core/src/environment.ts`                                                  | `RuntimeInfo`                                       |
| `core/src/output.ts`                                                       | `JsonValue`                                         |
| `cli/src/run.ts`、`cli/src/tui-command.ts`、`cli/src/prompt-command.ts` 等 | `RunContext`、`GlobalOptions`、`GlobalOutputFormat` |
| `cli/src/index.ts`                                                         | `export type { RunContext, GlobalOptions }`         |

### node-repl-host

| 调用方                                     | 引入的名字                                              |
| ------------------------------------------ | ------------------------------------------------------- |
| `browser-use-plugin/src/browser-client.ts` | `readNodeReplBrowserRuntimeBridge`（`/runtime-bridge`） |

`tool-contract` 的常量由插件运行时（browser-use-plugin / CUA 工具注册）与发布脚本经包入口读取；
`packages/desktop/scripts/official-plugin-staging.mjs`、`apps/cli/packages/cli/scripts/sea-official-plugin-assets.mjs`
以包路径做官方插件资产打包，不 import 具体符号。

## 包内调用方

| 包                         | 调用方                       | 被引模块                                                                                         |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `dynamic-workflow-runtime` | `src/index.ts`               | `harness`、`child-source`、`child-entry-file`、`protocol`（类型）                                |
| `dynamic-workflow-runtime` | `src/harness.ts`             | `protocol`（类型）、`child-source`、`child-entry-file`                                           |
| `dynamic-workflow-runtime` | `src/child-source.ts`        | `protocol`（仅类型）                                                                             |
| `i18n`                     | `src/index.ts`               | `locale`、`types`、`locales/en-US`、`locales/zh-CN`                                              |
| `i18n`                     | `src/locales/*`              | `types`（仅类型）                                                                                |
| `telemetry`                | `src/index.ts`               | `agent-trace-runtime`、`bootstrap`、`error-sanitizer`、`model-api-recorder`、`provider-endpoint` |
| `telemetry`                | `src/bootstrap.ts`           | `agent-trace-runtime`；启用时动态 `otlp-exporter`                                                |
| `telemetry`                | `src/agent-trace-runtime.ts` | `agent-trace-support`、`agent-metrics`、`compatibility-adapters`、`error-sanitizer`              |
| `telemetry`                | `src/agent-trace-support.ts` | `error-sanitizer`                                                                                |
| `telemetry`                | `src/model-api-recorder.ts`  | `provider-endpoint`                                                                              |
| `telemetry`                | `src/otlp-exporter.ts`       | `agent-trace-runtime`、`agent-metrics`、`model-api-recorder`                                     |
| `node-repl-host`           | `src/tool-contract.ts`       | 无                                                                                               |
| `shared-types`             | `src/index.ts`               | 无                                                                                               |

## 测试调用方与相邻套件

| 套件                                                           | 关系                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| `apps/cli/packages/i18n/test/**`（若存在）                     | 包内回归；本包不修改其断言                               |
| `apps/cli/packages/telemetry/test/**`（若存在）                | 包内回归；本包不修改其断言                               |
| `apps/cli/packages/node-repl-host/test/runtime.test.mjs`       | 继承的 `unreviewed` 测试；替换阶段删除或重写（§一.1）    |
| `apps/cli/packages/cli/test/sea-runtime-surface.test.mjs`      | 打包面回归，引 `@knorvia/i18n` / `@knorvia/shared-types` |
| `packages/desktop/test/official-plugin-runtime-build.test.mjs` | 官方插件打包面回归，引 `@knorvia/node-repl-host` 路径    |

本包契约测试（`tests/`）另行编写，通过公开入口与包内模块路径加载；与上述套件并存，
**不改它们的断言**。

## 相邻模块（不在本包范围）

- `@knorvia/contracts`、`@knorvia/contracts/telemetry`、`@knorvia/contracts/model`：`i18n` 的
  `SupportedLocale`/`UiLocale` 与 `telemetry` 的端口/事件类型来源；
- `@knorvia/dynamic-workflow`：`dynamic-workflow-runtime` 的只读依赖（引擎、`WorkflowError`、
  `lowerWorkflowScript`、公开端口类型）；
- `@knorvia/shared/node`：`resolveKnorviaDataRoot`，决定 telemetry 默认状态目录；
- `node-repl-host/src/*`（除 `tool-contract.ts`）：宿主实现与 #197 的返工范围；
- `apps/cli/packages/adapters`、`services`、`ui`、`desktop`：无上述五包的直接 import
  （`desktop`/`server` 仅在打包脚本里引用 node-repl-host 的路径）。
