# 三条打包界面流程的离线验收

2026-09-27，Windows 11 26200，Node 24.14.0，应用版本 `0.8.0-preview.3`。本轮使用真实生产包、真实 Host/SQLite/文件操作与本机回环协议夹具。没有真实模型调用，没有修改桌面便携包或用户数据。

## 可重复入口

```powershell
pnpm test:studio:packaged 'D:/tools.cache/knorvia-candidate-20260927/win-unpacked/Knorvia Studio.exe'
```

脚本按技能包 → 多文件接纳 → 媒体交接顺序执行，任何一组失败即返回非零；尚未执行的组不算通过。每组有独立临时资料，实际 userData 必须在对应 `data/profile` 内。退出有期限，超时强制清理属于失败；重开使用同一资料和不同进程。

必须把完整程序包复制到源码仓库外，不能使用 junction。原 CLI 解析器会沿 cwd 的祖先优先寻找开发入口，所以只把 cwd 改成仓库内 exe 目录仍不够。入口现在拒绝该位置并记录真实包路径、exe/asar/CLI 的 SHA-256，启动后校验 resourcesPath。此前仓库内的调试结果不作为本次最终打包验收证据。

生产构建来自 `packages/desktop/dist-stability-20260927/win-unpacked`，外置副本包内 CLI 哈希与构建目录一致；实际 Agent 子进程也确认使用副本的 `resources/knorvia/knorvia.cjs`。

## 已验证流程

| 流程             | 新包结果      | 独立证据                                                                        |
| ---------------- | ------------- | ------------------------------------------------------------------------------- |
| 三个技能包       | **5/5，通过** | `C:/Users/17018/AppData/Local/Temp/knorvia-plugin-install-qSHxyU/result.json`   |
| 多文件接纳       | **3/3，通过** | `C:/Users/17018/AppData/Local/Temp/knorvia-workspace-review-ldCyDU/result.json` |
| 图片上下游与重开 | **7/7，通过** | `C:/Users/17018/AppData/Local/Temp/knorvia-media-acceptance-iQak4a/result.json` |

技能包为 `project-handoff`、`material-organizer`、`document-quality-check`。界面实际登记来源、安装、启用、禁用、再启用；核对安装的清单、技能正文、兼容声明与来源字节相同。重开前保留最后一包禁用，重开后两启用一禁用及宿主技能目录状态一致。作者声明继续为 `declared`，界面继续标为未验证；不把安装成功升级成模型能力认证。

三条流程统一命令退出 0，总计 **15 项通过**。所有页面错误列表为空；媒体夹具错误为空，生成与编辑请求各一次，三个应用进程均正常退出（exit 0）。媒体的逐项证据见 [媒体记录](knorvia-media-acceptance-20260927.md)。

文件流程由真实群聊调度、权限审批和包内文件工具产生三个隔离修改。修改既有文件前先经 Read 工具读取，夹具不能绕过文件安全规则。源项目未接纳时不变；之后人为修改 `conflict.txt` 制造冲突，界面不能勾选它，全选只选择 `one.txt` 与 `two.txt`。接纳后核对两个项目文件及其 SHA-256，冲突文件保持用户新内容。

接纳收据精确关联业务 runId 与执行任务 stepId，包含唯一 operationId、两个路径、afterHash、`accepted`、`host-verified`、`journalState=complete`。真正退出、重开后收据和检查点不变、源文件字节不变、冲突仍显示，回环模型请求没有重放。审阅按隔离基线保留历史差异，文件条目继续存在是既有语义，不使用“条目消失”冒充成功。

## 其他验证与边界

- 根类型检查、lint、架构检查、CLI 类型检查与 lint 均通过；全量 `pnpm test:studio` **838/838 通过，0 失败、0 跳过**。生产构建退出 0。
- `pnpm test:studio:ui 'D:/tools.cache/knorvia-toolchain/electron-v41.0.3-win-x64/electron.exe'` **14 组通过**。本机 npm Electron 的可执行文件缺失，首次不带参数的调用失败；使用已固定的 Electron 41.0.3 实跑通过，没有通过重新安装依赖规避。
- 界面回归覆盖两个窗口尺寸的原生/外部内核输入框相同几何位置、工具页上下文侧栏、草稿保留、浅深色、玻璃关闭/仅背景/减少透明度及短窗口。记录在 `C:/Users/17018/AppData/Local/Temp/knorvia-activity-rail-0Smjl9`。
- 人工目视与 Windows 原生玻璃实际观感按用户要求未做；自动化 DOM、样式与图片解码证据不等于目视确认。
- 媒体范围是图片生成 → 参考图编辑。真实供应商、视频解码、Agent 理解图片、逐外部内核运行及技能输出质量不在本次离线验收结论内。
- 主日志：`D:/tools.cache/knorvia-123-packaged-final-20260927.log`。临时资料只作为本机证据，不加入源码仓库。
