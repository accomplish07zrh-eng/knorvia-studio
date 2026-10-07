<!-- SPDX-License-Identifier: Apache-2.0 -->

# 工作区运行环境验收记录

基线：2026-10-07 fetch 后 `origin/main` 为 `be610f46a7c34a500ec443cb6e335a531f12937b`，v0.8.8；freshness 通过、初始工作区干净。分支 `feat/workspace-runtime-lifecycle`。实施依据：[规格](../specs/knorvia-workspace-runtime.md)。新增源文件使用 Apache-2.0；既有许可、来源声明及冻结证据保持。

## 接口与归属

唯一新增公开方法为 `IStudioRuntimeService.workspaceRuntime({runId, stepId, control?})`。省略 control 查询，控制为 prepare/start/stop/recover；prepare/start 要明确 approved。服务解析已保存的物理工作区身份，拒绝本地执行远端工作区及只读命令权限。app owner 负责 token admission 与 SQLite 生命周期；Node adapters 负责 loopback 端口、监听归属/HTTP 健康及进程树清理。UI 在已有运行历史中展开状态，通过 hook 读 Host；不保存命令、环境或进程输出。

可能与集成重叠的文件：`studio-runtime/contract.ts`、`contract.example.ts`、`app/studioRuntimeService.ts`、`node.ts`、`StudioRunHistory.tsx` 和两个 locale 聚合入口。未修改 handoff、agenttools、turnExecutor、Git 后端、移动端或发布配置。根 `licensing/current-files.json` 仅刷新来源清单，合并后需按集成树重新生成。

## 运行证据

工具采用隔离安装的 Node 24.14.0、pnpm 10.33.2；仓库依赖按锁文件安装，未执行安装脚本。相关服务离线场景涵盖并行端口与状态、非 Git/dirty 文件保护、setup 成功/非零失败、取消/窗口争用、权限拒绝、启动失败、readiness 超时、端口被无关监听者抢占、自有树清理失败及恢复、已知凭据/旧基线过滤、真实 Host 退出后恢复、错误起始身份不终止无关进程、根先退出的自有后代、健康失效和关闭排空。

针对性命令：

```sh
node --import tsx --test packages/services/test/studio-workspace-runtime*.test.ts packages/services/test/studio-workspace{,-recovery,-history}.test.ts packages/services/test/studio-runtime{,-lifecycle,-barriers,-sequencing}.test.ts packages/services/test/studio-delivery-summary.test.ts
node --import tsx scripts/studio-workspace-runtime-smoke.mjs /usr/bin/chromium
pnpm typecheck
pnpm lint
pnpm fmt:check
pnpm architecture:check --changed
pnpm architecture:check
pnpm provenance:report
pnpm provenance:check
```

浏览器场景使用真实 RuntimeCard、hook、IntlProvider 与既有 ConfirmDialogHost，薄 HTTP 传输连接真实 app owner/SQLite/Node adapter；只替换 workspace service 获取入口，不伪造 runtime 状态。已覆盖取消授权不执行、显示实际 cwd、setup 失败禁用启动、准备成功、自有 loopback 预览及停止后撤销地址。首轮 smoke 的精确按钮名称未包含既有键盘提示，修正定位后通过，没有改产品确认语义。

最终结果：87 个定向及相邻场景中 86 通过、0 失败、1 个既有 Windows 条件场景跳过；其中新增 17 个 runtime 场景全部通过（含 4 个环境 sentinel 场景）。Chromium smoke 通过。根 typecheck、fmt:check、完整及 changed 架构检查通过；来源清单检查通过且 reviewProblems=0，26 项既有第三方材料义务仍保留。首轮类型检查发现控制联合类型与 adapter 参数错误，已修正后根 typecheck 通过；lint 0 error，保留 `scripts/packaged-runtime-evidence.mjs:121` 既有 no-control-regex warning。没有修改架构 baseline 或冻结证据。

## 集成审查后的环境边界修复

初始 head `c6a8165529fa3ead5b559ab3a245cb2554c2a1df` 的 adapter 直接继承 `process.env`，集成探测确认会把宿主凭据交给工作区命令，不能作为安全验收 head。修复采用明确 OS 环境白名单重建子进程环境，Windows 名称匹配不区分大小写并输出唯一规范名；仅增加本次 HOST/PORT，不传递提供商、GitHub/AWS、代理、npm 自定义配置、Knorvia 全局配置或 Node/Electron 注入变量。新增端口归属探测 helper 也使用该投影；现有 Host 进程识别依赖保持原合同。

4 个 sentinel 测试验证纯 Windows 大小写投影，以及真实直接 spawn、setup、setup 的子进程和 service 环境。报告只含变量名及受控 runtime 值，不写凭据值。相关回归为 86 pass / 0 fail / 1 skip，Chromium smoke 及根静态检查通过。Studio 契约公开方法实测为 12，架构上限保持 12，没有新增 RPC 端点。

## 限制与集成责任

本轮执行环境为 Linux，未实际运行 Windows/macOS 监听归属及进程恢复，也未执行完整打包桌面或全仓 `test:studio`；集成线程负责同一最终 head 的平台与聚合 CI。服务命令 argv 不经 shell；Windows 批处理应由用户明确选择解释器。运行准备只在用户显式操作后执行，不自动运行仓库 setup 指令，不从源目录复制依赖或凭据。

端口 socket 释放与子进程监听之间存在外部抢占窗口；归属核验/健康失败进入可见失败，绝不终止无关监听者。已知凭据名过滤不等于内容级秘密识别；未知文件名不作安全分类。突然断电/Host 崩溃期间未观测到的后代仍可能需要人工检查，恢复只清理保存且复核通过的身份。没有可信身份而 PID 仍活时保留 cleanup-required。

源文件、快照与依赖目录从不由 runtime cleanup 删除；停止失败保持 cleanup-required。分支交付为草稿 PR，最终合并、版本和稳定发布只属于集成线程。
