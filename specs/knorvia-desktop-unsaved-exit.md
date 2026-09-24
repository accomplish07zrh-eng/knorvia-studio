# 桌面未保存草稿关闭确认

2026-09-23。Renderer 的 studioAgentStore.dirty 是唯一未保存状态，注册 beforeunload；Main 不复制草稿或 dirty，不引入 IPC 状态镜像。

- 仅 createWindow 创建的应用主窗口注册 will-prevent-unload；不接管嵌入浏览器 guest。通过现有 currentApplicationLocale 读取桌面中英文语言。
- 原生确认默认和 Esc 均为“留在应用”，只有“仍然关闭”才调用该 Electron 事件的 preventDefault，允许卸载。同步确认防止同一次事件重复弹窗；对话框失败保留窗口。
- 普通关闭到托盘、macOS 隐藏窗口在 close 阶段已经取消，不触发 beforeunload，不弹确认。
- before-quit 仅处理原有运行中会话确认及退出意图，不停止 Host、调度器或采样。所有窗口通过 beforeunload 并关闭后，will-quit 才运行原有异步清理屏障。已 closed 的 Host 仍由已有 listDisposingHostProcesses 加入同一屏障。
- 取消任一草稿确认时复位 forceQuit、explicitQuit 和待重启意图，存活窗口及后台继续正常运行。没有窗口全部关闭就不会启动清理，也没有迟到退出回调。
- 重启只在最终清理完成后调用 app.relaunch，取消退出不会遗留下一次意外重启。重复 will-quit 只共享一次清理和最终退出。
- 退出清理期间禁止主窗口协调器新建窗口。CUA 系统设置观察在 will-quit 才结束，避免退出被取消却永久中断设置观察。

```text
dirty owner → renderer beforeunload → 主窗口 will-prevent-unload → 留下 / 允许卸载
app.quit → before-quit (只设置意图) → 各窗口关闭检查 → will-quit
                  ↑ 取消清除意图                         ↓
                  └── 应用继续                   原有异步清理 → [重启] → exit
```

离线验收：留在应用/允许关闭的 Electron 事件方向、重复同步确认、确认异常、中文英文及安全默认；退出请求不提前清理、取消后恢复、重新退出、重启取消、重复退出屏障、清理完成才退出。正常托盘 close 逻辑保持原有顺序。实机验收由主代理完成，不用模型、不读写用户桌面数据。

生命周期依据：[Electron app](https://www.electronjs.org/docs/latest/api/app#event-will-quit) 与 [will-prevent-unload](https://www.electronjs.org/docs/latest/api/web-contents#event-will-prevent-unload)。
