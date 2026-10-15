# apps-cli-packages-01-model 调用方（callers.md）

## 方法

`pnpm dep:refs --list-exports` 对 `apps/cli/packages/adapters` 的路径报「源文件未加载到 project」，不可用。
改用两种等价方法并交叉核对（命令均在仓库根目录、Node 24）：

1. **导出面**：`tests/build-interface.mjs` 用 TypeScript 编译器 API 逐字提取 44 个文件的导出签名
   （结果在 [interface.md](./interface.md)）；
2. **调用方**：全仓 import 检索（ripgrep）`@knorvia/adapters/model`、`@knorvia/adapters`、
   `from "../model/`、`from "./model`，逐条人工核对是产品代码、测试还是证据工件。

## 公开入口（兼容面）

| 入口                               | 形态                                                          | 说明                                               |
| ---------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `@knorvia/adapters/model`          | `package.json` exports `./model` → `dist/model/index`         | 稳定兼容面（apps-cli-packages-01 合同 v3 §十一.3） |
| `@knorvia/adapters`（根桶）        | `adapters/src/index.ts` 的 `export * from "./model/index.js"` | 根桶再导出同一集合                                 |
| `adapters/src/model/*.ts` 模块路径 | 相对路径直引                                                  | 包内互引与测试按模块路径加载                       |

## 跨包调用方（产品代码）

全部经 `@knorvia/adapters/model`，集中在 `apps/cli/packages/bootstrap`：

| 调用方文件                                             | 引入的名字                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `bootstrap/src/model-factory.ts`                       | `AiSdkModelAdapter`、`AiSdkModelExecutionConfig`、`EnvRecord`   |
| `bootstrap/src/model-config.ts`                        | `AiSdkModelExecutionConfig`、`AiSdkNetworkConfig`、`EnvRecord`  |
| `bootstrap/src/app/workflow-driver-model-failure.ts`   | `inspectWorkflowModelFailure`、`WorkflowModelFailureInspection` |
| `bootstrap/src/app/types.ts`                           | `AiSdkModelAdapter`（type）                                     |
| `bootstrap/src/app/provider-registry-model-runtime.ts` | `AiSdkModelAdapter`（type）                                     |

根桶（`@knorvia/adapters`）的现有跨包调用方（`cli/src/run.ts`、`bootstrap/src/protocol/server-types.ts`、
`bootstrap/src/protocol/process-child-processes.ts`、`bootstrap/src/app/bundled-plugins.ts`）引入的都是
logging / mcp / plugins 名字，未直接使用 model 名字；但根桶 `export *` 的集合受本包导出影响，导出名
不得增删（见 interface.md）。

`packages/services`、`packages/ui`、`packages/desktop` 无 `@knorvia/adapters/model` 直接调用方。

## 包内调用方（adapters 内）

| 调用方                                              | 被引模块                                           | 说明                   |
| --------------------------------------------------- | -------------------------------------------------- | ---------------------- |
| `adapters/src/index.ts`                             | `model/index.js`（整面再导出）                     | 根桶                   |
| `model/runner.ts`                                   | `model-execution`、`model`                         | 适配器装配入口         |
| `model/runner-generate.ts`                          | `model-execution`、`workflow-model-failure-policy` | 非流式 attempt         |
| `model/runner-stream.ts`                            | `workflow-model-failure-policy`                    | 流式 attempt           |
| `model/runner-options.ts`                           | `model-execution`、`model-request-headers`         | 请求选项与 header 合并 |
| `model/runner-runtime.ts`                           | `model-execution`                                  | 运行时装配             |
| `model/runner-debug.ts`                             | `model-execution`                                  | 调试持久化             |
| `model/model-execution.ts`                          | `model-option-map-fetch`、`model-request-headers`  | 选项映射与 header      |
| `model/failure-classifier.ts`                       | `model-execution`                                  | 业务错误判定           |
| `model/failure-ai-sdk-provider-error.ts`            | `model-execution`                                  | AI SDK 错误归一        |
| `model/failure-provider-business-codes.ts`          | `model-execution`                                  | 业务码表               |
| `model/provider-finish-business-error.ts`（范围外） | `model-execution`                                  | 终局业务错误           |
| `model/anthropic-request-metadata.ts`               | `model-execution`                                  | Anthropic metadata     |

`provider/`、`exec/`、`workflow/` 等同包适配层**没有** `../model/…` 相对引用（全仓检索实测为 0；
apps-cli-packages-01 合同 v3 §十一.2 的「相对路径引用」是边界保留约定，不是现存引用清单）。

## 测试调用方

| 测试                                                                                       | 加载方式                                                                    | 覆盖                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------ |
| `apps/cli/packages/adapters/test/model-subsystem-contract/**`（10 个 case + 8 个 harness） | `@target/<模块名>` 别名（`harness/loader.ts` 装载，源码与确切 dist 各一组） | 51 个模块全量（含 7 个范围外） |

该套件是历史隔离批次（model adapter v10）随附的永久回归入口，收集进 `pnpm test:studio`；本包契约测试
（`tests/`）另行编写，两者都必须保持全绿，**不改它的断言**。

## 证据工件中的引用（非产品调用方，不计兼容面）

`docs/evidence/**/public-shapes.d.ts`、`docs/evidence/**/dependency-api.d.ts` 里的 `../model/index.js`
等引用是历史批次的证据快照，不参与构建，不在兼容面内。

## 相邻模块（不在本包范围）

- `apps/cli/packages/contracts/src/model/**`：契约包自己的模型类型（`ModelSelection`、`ModelUsage` 等），
  被 contracts/core 以 `../model/…` 相对引用——与本包同名不同目录，勿混淆；
- `apps/cli/packages/core/src/model/**`、`core/src/**/model/**`：core 自己的模型上下文；
- `@knorvia/model-option-map`：独立包，`model-execution.ts` / `model-option-map-fetch.ts` 的只读依赖。
