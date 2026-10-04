# Native 接入交接

接收线程：`01a1001a-4b5f-750a-9eaf-bfa1d2c5d0d4`。UI 在生成前尝试发送协调消息，
但当前工具未提供 cloud_threads，CLI queue 因只读状态库失败，未送达；目录/尺寸
按既有 NSIS 能力拟定，尚未收到 native 确认。整合线程可转交此文件及提交。

## 品牌资源

资源在 desktop 包根目录下，相对 electron-builder 配置路径为：

| 已有 option | 新路径 | 规格 |
| --- | --- | --- |
| `nsis.installerSidebar` | `build/installer-branding-20261003/installerSidebar.bmp` | 164×314，24-bit BMP |
| `nsis.uninstallerSidebar` | `build/installer-branding-20261003/installerSidebar.bmp` | 同一品牌侧图 |
| `nsis.installerHeader` | `build/installer-branding-20261003/installerHeader.bmp` | 150×57，24-bit BMP，右侧槽位 |

保留当前正式 installerIcon/uninstallerIcon；本批没有重复生成 ICO/ICNS。当前
assisted 流程的 `installerHeaderIcon` 是 oneClick 选项，不用于这张 MUI header。
native 修改配置时应使用已有 bitmap 路径入口，不能只替换未被该流程读取的 ICO。
保留默认 MUI 图形伸缩与更新跳页、安装目录/权限/快捷方式/卸载保护流程。

## 文案与控件

`copy.json` 包含 zh-CN/en-US 文案及既有 MUI 对应项：welcome title/text、finish
title/text/run text；安装中标题/说明通过现有 MUI installing language strings。
主标题均为 Knorvia Studio。native 拥有 LangString、页眉/字体和运行复选框接入；
UI 本批不写 NSIS include 或创建另一套 page 宏。不要用位图中的文字替代这些原生
标签，避免缩放及语言失配。

安装页只沿用原生 progress 和 ShowInstDetails；示例文件/阶段不作为新增产品承诺。
取消/返回/完成的启用状态仍由现有 NSIS 生命周期决定，预览不创建第二状态所有者。
字体若调整为系统 Segoe UI，需在 native 编译中确认 CJK 回落与页面布局。

## 最小接入核验

UI 只检查两 BMP 文件头、尺寸、编码、几何/输入哈希，以及预览实际资源加载和
布局。没有构建整应用、没有重跑应用测试/lint/typecheck/来源审计。

native 接入后确认 NSIS 编译实际读取这两张 BMP，随后在 Windows 云环境查看欢迎、
安装进度/详情与完成页；确认中英文及常用 DPI 不裁标题/正文/按钮。保留升级、
卸载和用户数据的既有行为。真正的原生截图、安装包和 GitHub Release 由 native/
整合任务交付，本批 HTML/PNG 是设计预览，不能代替这项验收。
