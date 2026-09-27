# Windows 打包媒体交接验收

2026-09-27。新增可重复的离线界面验收，补齐创作媒体此前仅有服务层测试的边界；本轮未修改创作业务实现。

## 执行入口

```powershell
node scripts/studio-media-acceptance.mjs '<win-unpacked>/Knorvia Studio.exe'
```

Node 使用 24.14.0；依赖仓库已安装的 `playwright-core`，无需安装浏览器。完整程序包须复制到源码仓库外；入口校验祖先目录，记录 exe/asar/CLI 的 SHA-256 并核对实际 resourcesPath，防止误用开发 CLI。执行文件可以带便携标记：脚本总是指定新的临时 `KNORVIA_PORTABLE_DIR`，并断言实际 `userData` 为临时根的 `data/profile`。不启动桌面真实配置，不覆盖便携包。

脚本在未更改的打包程序 Main 入口前，通过本机调试通道注入测试守卫。守卫只处理隔离路径、隐藏窗口、关闭后台节流及网络出口：Main、窗口 Host 的 Node TCP 和 Electron 网络出口拒绝非回环请求；Renderer 同样拦截外部 HTTP。每次 Main/Host 加载时对 `.invalid` 域名做同步拒绝反例，确认没有打开连接。供应商仅监听 `127.0.0.1`；不替换 CreationService、工作流执行器、RPC 或文件预览服务。

## 流程与真实断言

1. 页面打开创作模型管理，填写回环接口和专用假密钥并保存。凭据与模型都只落在本次临时根。
2. 应用完全退出后，在隔离数据库放入一份「开始 → 生成原图 → 人工批准 → 参考图编辑 → 结束」定义。只允许种入定义，不伪造运行、结果或创作任务。
3. 页面打开该工作流并提交运行。生成端点收到一次请求，人工批准控件出现时下游尚无请求。
4. 页面明确批准，下游编辑端点实际收到 multipart，包含上游完整 PNG 字节，且不含项目中的同名诱饵文本。
5. 两份不同的 4×4 PNG 逐块 CRC 和解压校验通过；磁盘输出字节与供应商一致，记录哈希和下游参考哈希正确。检查点保留 `creation-output` 引用，没有 PNG base64；原项目未被改写。
6. 创作页面通过真实文件预览服务展示两张图，浏览器 `decode()` 成功、实际尺寸 4×4、data URL 字节等于磁盘产物；两条历史的参数快照均显示可重建。
7. 退出前记录请求数，真正退出应用再以同一隔离根重开。工作流历史仍显示完成，创作历史/图片/任务 ID 保留；整个重启与历史加载期间请求数不变。

## 本轮结果

最终新包：`D:/tools.cache/knorvia-candidate-20260927/win-unpacked/Knorvia Studio.exe`，来自 `KNORVIA_ENV=production` 构建的 `packages/desktop/dist-stability-20260927/win-unpacked`，程序版本 `0.8.0-preview.3`。统一入口 `pnpm test:studio:packaged` 三条流程总计 15 项通过，退出 0。

- 打包界面脚本：**7/7 通过，退出码 0**。只有 `/v1/images/generations` 和 `/v1/images/edits` 各一次；`fixtureErrors=[]`、`pageErrors=[]`。
- 六个实际 Main/Host 进程均记录了门禁加载及拒绝自检；被拦截的目标只有自检用 `network-block.invalid`，没有外部服务请求。
- 结果：`C:/Users/17018/AppData/Local/Temp/knorvia-media-acceptance-iQak4a/result.json`。三个应用进程经真实 quit 流程退出，退出码均为 0；每次重开 PID 不同。仅隔离测试的确切退出确认由脚本回答，超时强杀会使验收失败。临时夹具数据与日志保留供核对，不进入 Git。
- 四个脚本的定向 `oxlint`：0 警告、0 错误；定向格式化完成；`pnpm architecture:check --changed`：0 violations / 0 baseline / 0 new。
- 根 typecheck、lint、架构、格式检查，以及 CLI typecheck/lint 均通过；全量离线回归 **838/838 通过**，14 组界面布局与材质回归通过；生产构建退出 0。

早期使用仓库内旧包的 7/7 调试结果保留在 `knorvia-media-acceptance-R6yCDZ`，不作为最终新包证据。核查发现仅把 cwd 改成 exe 目录仍可能沿祖先找到源码 CLI，因此本次最终执行使用仓库外完整副本，并新增路径拒绝与包散列校验；新包结果取代该项验证边界。未修改业务实现来绕过断言。

## 未验证边界

本脚本覆盖图片创作 → 图片参考编辑路径；不据此宣称 Agent 消费图片、视频解码、ComfyUI、真实供应商、真实外部 CLI 或付费推理已通过打包验收。人工目视复核继续按用户要求跳过，图片解码与 DOM 操作属于自动化证据。测试守卫属于验收设施，不能当成产品自带网络隔离能力。
