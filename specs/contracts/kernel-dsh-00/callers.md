# kernel-dsh-00 调用方

`pnpm dep:refs` 对本包没有“被替换导出”可查；下面是新增入口的调用方与相邻边界。

## 一、直接调用方

| 调用方           | 位置                                                             | 用途                                                                                                              | 本包改动             |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------- |
| CLI 协议命令     | `apps/cli/packages/cli/src/run.ts` · `runKnorviaProtocolCommand` | 在加载 `@knorvia/bootstrap` 前解析引擎；`dsh` 时动态 import `@knorvia/bootstrap/kernel` 并调用 `runKernelProcess` | 新增分支；旧分支不变 |
| CLI 引擎解析     | `apps/cli/packages/cli/src/kernel-engine.ts`                     | 保留一份不依赖 DSH 的 `resolveKernelEngine` 调用（通过 `@knorvia/bootstrap/kernel-engine`）                       | 新文件               |
| bootstrap 根入口 | `apps/cli/packages/bootstrap/src/index.ts`                       | 不新增根导出；`runKnorviaProtocolAgent` 保持原样                                                                  | 不改                 |
| 后续协议桥       | `apps/cli/packages/kernel-plugins/bridge`（`kernel-bridge-01`）  | 消费 `KernelHost.context` 的 `sessions` / `agents` / 事件                                                         | 本包只提供 host      |
| 测试             | `specs/contracts/kernel-dsh-00/tests/**`                         | 进程级与 host 级断言                                                                                              | 新增                 |

## 二、相邻但不在本包范围

| 模块                                                                  | 为什么不改                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bootstrap/src/protocol-entrypoint.ts`                                | 旧运行时入口；默认路径必须继续走它                                       |
| `bootstrap/src/app/create-app.ts`                                     | 旧应用组合根；新运行时不用它                                             |
| `apps/cli/packages/core/**`                                           | 旧运行时；`kernel-switch` 才删除                                         |
| `apps/cli/packages/tui/**`                                            | 终端交互模式；开关只对 `app-server`/`agent-server` 生效                  |
| `packages/services/src/studio-runtime/adapters/kernels/acpCatalog.ts` | 外部 `deepseek-harness` 内核；有意使用用户自己的 DSH，与自带内核互不影响 |
| `packages/shared/src/protocol-v4/**`                                  | v4 协议类型；本包不产生帧                                                |

## 三、依赖方向

```text
cli (run.ts)
  ├─ @knorvia/bootstrap/kernel-engine   （无 DSH 依赖）
  └─ @knorvia/bootstrap/kernel          （仅 dsh 分支动态加载）
        ├─ @deepseek-ai/dsh-app-boot
        ├─ @deepseek-ai/dsh-home-paths
        └─ 组合中的 DSH 插件包
```

- `bootstrap/kernel` 不得被 `bootstrap/index.ts` 静态 re-export，否则默认路径会加载 DSH。
- `bootstrap/kernel-engine` 不得 import `kernel/index.ts` 或任何 `@deepseek-ai/*`。
- Knorvia 后续插件放 `apps/cli/packages/kernel-plugins/<名称>`，由组合清单追加，不得从 CLI 或 bootstrap 深层导入。

## 四、`dep:refs` 结论

本包没有删除或改名既有导出，`pnpm dep:refs` 的既有结果不变。新增导出只被上表调用方使用；实现 PR 附 `pnpm dep:refs` 对新增文件的引用查询结果。
