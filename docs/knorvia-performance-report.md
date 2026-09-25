# Knorvia Studio 性能报告（T10：桌面启动与长任务）

日期：2026-09-25。基线提交 `c763651bd14fe7b71ab947b0415036cd5b39b007`（版本 `0.8.0-preview.2`）。
机器可读记录：[perf-baseline-2026-09-25-t10.json](perf-baseline-2026-09-25-t10.json)；逐项测量口径见 [perf-baseline.md](perf-baseline.md) 的 T10 小节；规则见 [../specs/knorvia-performance-baseline.md](../specs/knorvia-performance-baseline.md) 的 T10 补充。

本报告只写实际执行过、可复现的命令与数字。没有测到的项在“未验证”里列明。

## 1. 测量条件（先说清楚，避免误比较）

| 项       | 本轮                                                                           | 2026-09-25 首次基线                |
| -------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| HEAD     | `c763651` / `0.8.0-preview.2`                                                  | `0.8.0-preview.1`                  |
| Node     | **v26.3.0**（`mise.toml` 固定 24.14.0，但本机未安装 `mise`）                   | 24.14.0                            |
| 桌面构建 | `packages/desktop/dist/win-unpacked`，构建自提交 `48894e8`，**本轮未重新打包** | 同一台机器上完成的 production 打包 |
| 便携目录 | 660,144,096 字节 / 118 文件（排除 `data/`）                                    | 660,206,104 字节 / 122 文件        |
| 数据规模 | 隔离临时配置（`KNORVIA_PORTABLE_DIR`）；滚动夹具 10,000 条浏览器内合成消息     | 同口径                             |
| 冷/热    | 冷启动 4 次（每次运行 1 次），热启动 6 次；两类分开记录                        | 只记冷启动到首次引导               |
| 样本数   | 滚动 6、桌面冷 4 / 热 6、运行历史渲染优化前后各 2                              | 滚动 4、桌面 4                     |

机器：Windows 11 build 26200、AMD Ryzen 9 7845HX（24 逻辑核）、31.2 GiB RAM、本机 Chrome 154.0.8037.57、pnpm 10.33.2。

**条件与首次基线不同（Node 版本、构建来源、便携目录内容都不一样），因此本轮数字不能用来声称相对首次基线的回归或改进。** 下面“优化前/后”的比较都是同一轮、同一台机器、同一份脚本、同一天内的自比较。

## 2. 命令

```powershell
# 1) 时间线滚动基线（10,000 条合成消息，无头 Chrome）
node scripts/perf-baseline.mjs

# 2) 运行历史渲染成本（真实组件，100 条运行 × 8 步）
node scripts/perf-baseline.mjs --run-history

# 3) 桌面冷/热启动分阶段 + 空闲进程树 + 便携目录字节
node scripts/perf-baseline.mjs --executable "D:\tools\knorvia-studio\packages\desktop\dist\win-unpacked\Knorvia Studio.exe" --portable-dir "D:\tools\knorvia-studio\packages\desktop\dist\win-unpacked" --desktop-samples 3

# 4) 一条命令产出完整记录（对应 docs/perf-baseline-2026-09-25-t10.json）
node scripts/perf-baseline.mjs --run-history --executable "...\Knorvia Studio.exe" --portable-dir "...\win-unpacked" --desktop-samples 3
```

脚本只打印 JSON、不写任何文件；新增字段都在既有键之下（`desktop.samples[].phases`、`desktop.firstInteractiveMs`、`desktop.readyToSend`、`desktop.hostStartup`、`runHistory`），旧键 `scroll`/`coldStartToOnboardingMs`/`idle`/`portable`/`artifact` 语义不变。

## 3. 实测结果

### 3.1 长会话时间线滚动（回归项，未改代码）

6 次样本：p50 6.8–10.0 ms、p95 20.1–26.7 ms、>33 ms 帧 0–2 次、最大挂载行恒为 20、离底追加与旧页插入锚点偏移恒为 0 px。夹具自检（合成消息数 = 10,000、追加后计数 = 10001、页面错误 = 0）由脚本断言。结论：时间线虚拟化在本轮条件下稳定，无需改动。

### 3.2 运行历史有界渲染（本轮唯一优化）

非紧凑运行历史（成组细节面板 / 工作流历史面板）此前渲染**全部**运行并读取每条运行的 `checkpoint.steps`。服务端投影最多给 100 条运行，实测 100 条 × 8 步 = 一次挂载 800 个步骤行、3,613 个 DOM 节点。

| 指标（100 条 × 8 步） |                  优化前 |                            优化后 |        变化 |
| --------------------- | ----------------------: | --------------------------------: | ----------: |
| 首屏渲染              |     442.2 ms / 471.1 ms |               234.7 ms / 249.2 ms | −44% … −47% |
| 刷新一次（新增 1 条） | 236.3 ms（渲染 101 条） | 131.9 ms / 142.0 ms（渲染 20 条） | −40% … −44% |
| 挂载步骤行            |                     800 |                               160 |        −80% |
| 面板 DOM 节点         |                   3,613 |                               726 |        −80% |
| 内容高度              |               40,908 px |                          8,260 px |        −80% |

“优化前”用两行数字：改动前真实源码（`mountMs` 471.1 ms）与同一脚本把窗口临时放宽到 1,000 条（等价于旧行为，用于取得可比的刷新耗时 236.3 ms）；两者渲染结果完全一致（3,613 节点）。

**没有丢失历史**：优化后反复点击“显示更早运行”直到按钮消失，面板重新挂载 101/101 条运行、808/808 个步骤行。窗口始终是时间倒序连续前缀；正在复核的运行、以及 `queued`/`running`/`waiting` 的运行即使被新运行挤出首屏也保持渲染（否则会丢掉复核结论或停止入口）。时间线底部的 compact 视图行为完全不变（仍只渲染最近 3 条、不分页）。

### 3.3 桌面启动分阶段（打包程序，未重新打包）

`<3 秒` 目标**未达到**：冷启动到首次引导 5,904–6,430 ms（4 次冷启动样本），最近一次运行的 3 个样本中位数 6,002 ms。热启动 5,900–6,627 ms（6 次样本）。冷热没有可分辨差异 → 这份开销每次启动都要重付。

最近一次冷启动（相对进程创建 T0）：

| 阶段                                         |                耗时 |
| -------------------------------------------- | ------------------: |
| 进程创建 → main 模块执行（含 Electron 启动） |              817 ms |
| main 模块 → `app.whenReady`                  |               73 ms |
| app ready → 主窗口 `loadURL`                 |              339 ms |
| `loadURL` → renderer bundle 开始执行         |              803 ms |
| renderer 开始 → React 首次 commit            |               20 ms |
| 首次 commit → Host utilityProcess 派生       |                4 ms |
| **Host 派生 → 首次可交互**                   | **3,843 ms（65%）** |
| 合计（T0 → 首次引导可见）                    |            5,899 ms |

Host 侧归因（应用自身生产日志；Host 行经 main 转发，时间戳为接收时刻）：`dom-ready` 2,046 ms、Host 派生 2,056 ms、Host `initializing local services` 5,478 ms、`local services ready, all channels registered` 5,722 ms、首次可交互 5,899 ms；`[database-startup] terminal` 为 `status=ready`、`durationMs` 2,843（另两次 3,045 / 2,884）。

**结论：首次可交互的主要阻塞点是 Host 的存储准备（迁移/建库，约 2.8–3.0 s）加上 Host Node 引导与通道注册，不是渲染进程、不是内核探测，也不是第一轮启动特有的建库。** 这段代码位于 `packages/desktop/src/host/*` 与 `packages/services` 的存储层，不在本轮写入范围，因此本轮没有改动，也没有声称任何启动改进。

其它实测：Playwright 附加/握手 982 ms（与 main 模块求值重叠，属测量开销）；“可发送”在首次引导出现后 1,513 ms 可用（`[data-testid="v4-composer-input"]`，含脚本化跳过引导的时间），从启动器起点约 7,491 ms；空闲进程树 7 个进程、工作集求和 1,159.9 MiB、私有提交 1,144.8 MiB（4 次运行范围 1,152.1–1,172.6 / 1,137.9–1,151.9 MiB）。

### 3.4 生产日志（长会话）

冷启动到可发送的隔离配置日志 17,761 字节 / 98 行：`[debug]` 0 行、`rpc:call` 11 行；只有生命周期、通道注册、RPC 计时、临时目录路径与 provider 注册表哈希，没有凭据、真实用户数据或逐 chunk 原始流。

发现（未改动）：`packages/rpc/src/logging-middleware.ts` 把每一次 RPC 调用与事件订阅都记在 info，仅 `agent.backgroundBashOutputV4 OK` 在 `packages/desktop/src/host/rpcLogLevel.ts` 降为 debug。它不是原始流，但在长会话里按调用次数线性增长。该文件不在本轮写入范围，作为风险上报。

## 4. 改了什么 / 回滚

| 改动                                                                       | 文件                                                                                                                                                                     | 实测效果                                                         | 回滚                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 运行历史有界渲染：首屏 20 条 + “显示更早运行”分页；复核中/活动运行强制可见 | `packages/ui/src/studio/runtime/StudioRunHistory.tsx`、新增纯函数 `packages/ui/src/studio/runtime/studioRunHistoryWindow.ts`                                             | 首屏 −44%…−47%、刷新 −40%…−44%、步骤行与 DOM 节点 −80%（3.2 节） | 删除新文件，把组件中 `historyWindow.visible` 改回 `runs` 并移除分页按钮即可；两处都是独立改动，不影响服务端投影 |
| 桌面启动分阶段测量（只读，不改应用代码）                                   | `scripts/perf-baseline.mjs`                                                                                                                                              | 把 T0→首次可交互拆成 7 段并定位到 Host 存储准备（3.3 节）        | `git checkout -- scripts/perf-baseline.mjs`；不影响运行时                                                       |
| 新增/更新的测试与文档                                                      | `packages/ui/test/studio-run-history-window.test.ts`、`specs/knorvia-performance-baseline.md`、`docs/perf-baseline.md`、`docs/perf-baseline-2026-09-25-t10.json`、本文件 | —                                                                | 直接删除/还原                                                                                                   |

`scripts/perf-baseline.mjs` 顶部加了一行 `/* eslint-disable max-lines -- ... */`：脚本现在 881 行，超过仓库 400 行的 `max-lines` 上限。仓库里 `scripts/native-search-tools-unix.mjs`、`scripts/prepare-prebuilds.mjs` 用的是同一处理方式；`.oxlintrc.json` 与 `.architecture-baseline.json` 均未修改，没有放宽任何全局策略。

## 5. 明确没有做的事

- 没有改 Electron 版本、没有重写 V4、没有重做 UI 栈，也没有为省几百毫秒绕过初始化正确性。
- 没有改 `packages/desktop/src/main/localDiagnostics.ts`（另一任务所有），没有碰代理/设置/内核状态 UI、创作与工作流文件。
- 没有改 `kernelRegistry.ts`：本轮没有证据表明内核探测阻塞首次可交互（探测由 renderer 首个订阅者触发；本机未安装任何 CLI 内核，Host 日志为 `Knorvia agent binary path: <not found>`、`providerCount: 0`，`kernels/README.md` 记录的约 20 s 握手无法在本机复现）。
- 没有修改或重新交付桌面便携包（`packages/desktop/dist/win-unpacked` 仍是 `48894e8` 的产物，`C:\Users\17018\Desktop\Knorvia Studio Portable` 未触碰）。
- 没有把 dev 模式与 production 构建做对比；没有在未测到的情况下声称 `<3 秒` 达标。

## 6. 未验证 / 剩余风险

1. **Host 存储准备 2.8–3.0 s**：已定位但没有修复（不在写入范围）。这是 `<3 秒` 目标的主要障碍；要真正达标必须在 Host/存储层做分阶段或延后初始化，且必须重新打包后按同一命令重测。
2. **main/renderer bundle 求值 817 ms + 803 ms**：只从启动分阶段看得到，本轮未优化（打包程序未重建，改源码无法验证效果）。
3. **RPC info 日志**：长会话按调用次数增长，未改动。
4. 内核探测的真实成本、真实模型/CLI/SSH 发送延迟、真实 10,000 条持久历史的内存、安装向导、人工目视复核、物理显示器帧率，本轮都未测。
5. 桌面数字来自 `48894e8` 的打包产物，与 HEAD 源码不一致：任何桌面侧源码改动的效果都需要重新打包才能验证。
6. 运行历史的窗口大小（20）是在 100 条 × 8 步的合成夹具上选的；真实项目里单条运行的步骤数会变化（持久化 checkpoint 有界），未在真实数据上复核。
