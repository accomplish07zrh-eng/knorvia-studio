# kernel-bridge-01 调用方

本包不新增公开模块路径，也不删除/改名既有导出；下面是新桥的调用方、被复用模块与相邻边界。

## 一、直接调用方

| 调用方            | 位置                                                               | 用途                                                                  | 本包改动                         |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------- |
| CLI 协议命令      | `apps/cli/packages/cli/src/run.ts` · `runKnorviaProtocolCommand`   | `KNORVIA_KERNEL_ENGINE=dsh` 时动态加载 kernel 入口；新桥接管 v4 stdio | 实现阶段在新桥内落地；旧分支不变 |
| 新桥 runtime      | `apps/cli/packages/kernel-plugins/bridge`（实现阶段）              | 消费 `KernelHost.context`，把 v4 命令/订阅映射到 DSH 会话与事件       | 新增                             |
| 桌面 / 手机客户端 | 既有 host 通道层（`desktop-continuous` / `web-remote-replayable`） | 只按 v4 协议调用；不感知引擎                                          | 不改                             |
| 合同测试          | `specs/contracts/kernel-bridge-01/tests/**`                        | spawn `app-server --stdio`，只读写 NDJSON                             | 新增                             |
| 旧门运行器        | `specs/contracts/kernel-bridge-01/tests/run-old-gate.mjs`          | 默认引擎/桩/实施期 DSH 三态门                                         | 新增                             |

## 二、被复用的既有模块

| 模块                                                        | 复用方式                                                     | 约束                               |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| `bootstrap/src/protocol-v4/command-inbox.ts`                | 命令准入、CAS、幂等、settled 查询                            | 不复制第二份决策逻辑；裁决顺序不变 |
| `bootstrap/src/protocol-v4/v4-gateway.ts`                   | 方法路由、订阅 ACK、flow、命令终态收口                       | 新桥提供 host 端口；协议形状不变   |
| `bootstrap/src/protocol-v4/conversation-topic-publisher.ts` | snapshot/deltas、log/journal、订阅缓冲                       | 序号与帧语义不变                   |
| `bootstrap/src/protocol-v4/product-projection.ts`           | DSH 事件 → v4 deltas                                         | 投影词表不变；不新增事实来源       |
| `packages/shared/src/protocol-v4/**`                        | 信封、ACK、帧、snapshot schema                               | **只读**；字段一字不改             |
| `@knorvia/bootstrap/kernel`（kernel-dsh-00）                | `KernelHost.context`（`ctx.sessions` / `ctx.agents` / 事件） | 不修改其导出签名；只消费公开 API   |

## 三、相邻但不在本包范围

| 模块                                                         | 为什么不改                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `apps/cli/packages/core/**`                                  | 旧运行时；`kernel-switch` 才删除                            |
| `bootstrap/src/protocol-entrypoint.ts` / `app/create-app.ts` | 旧运行时入口与组合根；默认路径必须继续走                    |
| `packages/services/src/studio-runtime/adapters/kernels/**`   | 外部内核目录；与本机内置内核互不影响                        |
| `apps/cli/packages/tui/**`                                   | 终端交互模式；引擎开关只对 `app-server`/`agent-server` 生效 |
| `@deepseek-ai/*` 包源码                                      | 第三方依赖；只通过公开 API 消费，不 patch、不 fork          |

## 四、依赖方向

```text
cli (run.ts)
  └─ @knorvia/bootstrap/kernel（kernel-dsh-00，仅 dsh 分支动态加载）
        └─ KernelHost.context
              ├─ ctx.sessions  (create/enter/flush/fork…)
              ├─ ctx.agents    (create/resume…)
              └─ events        (session/event, session/flush, …)
                    │
                    ▼
        kernel-plugins/bridge（kernel-bridge-01）
              ├─ CommandInbox（既有裁决）
              ├─ ConversationTopicPublisher / ProductProjection（既有数据面）
              ├─ v4 gateway（既有方法路由）
              └─ @knorvia/shared/protocol-v4（只读 schema）
```

- 桥不得从 CLI 或 bootstrap 深层导入未公开路径；跨包只走公开入口。
- 新桥不得被 `bootstrap/index.ts` 静态 re-export，避免默认路径加载 DSH。
- DSH 事件是会话事实来源；桥不得反向写 DSH 内部存储或绕过 `ctx.sessions`。
- renderer/UI 不直接调用桥；只通过既有 host 通道与 v4 协议。

## 五、`dep:refs` 结论

本包没有删除或改名既有导出，`pnpm dep:refs` 的既有结果不变。实现阶段若新增包内导出，仅被上表调用方使用，并在实现 PR 附 `pnpm dep:refs` 对新增文件的引用查询结果。
