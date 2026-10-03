# Chrome policy 夹具的平台路径拼写

2026-10-03。同一 native 任务和 `rewrite/native-20261003` 分支，输入为
`902e35c6dbcfa4b829270352fecf03ebc07b219f`。

先读取 PR24 与旧 run37123232166 的真实 Windows job111203311217。
触发 head 为 `ad712690b3eb1501574c1d29361dc801c1414373`，实际 checkout
为 merge `7bd43bfd70486ef0e9b90bc3e2174cd81130404d`。四份生产实现与合同
夹具在这三份输入间逐字节相同，因此两项失败仍适用于当前夹具。

两个 registry 响应硬编码 `/`，断言却以当前平台的 `join` 构造期望路径。
Windows 生产结果正确保留变量替换后的混合分隔符，断言要求全反斜杠。
这不是 profile 缺失、HKCU/HKLM 顺序错误或生产路径解析失败。

## 保留规则与唯一 owner

`chromeProfileDiscovery.ts` 是生产策略扩展与候选选择的既有 owner：先替换
Chrome 变量，再替换 percent 环境变量；保留未知变量、分隔符拼写、查询失败
继续和 HKCU 优先级。`source.userDataDir` 是扩展后的策略文本；`profilePath`
是既有 `join(userDataDir, profileDirectory)` 文件路径。两者不可合并成一个
归一化表达，否则会改变用户策略与候选 exact-deduplication 的既有行为。

本次只修 `packages/desktop/test/native-browser-crash-contracts.test.ts`。
两项原场景的 registry 输入用同一平台路径规则构造，与其原样保留的期望一致；
不得改生产代码归一化输出、放宽比较、跳过 Windows 或取消 hive/未知变量断言。
另外补一项固定 `/` 策略，严格比较完整 source：原样保留扩展后的 `userDataDir`，
独立按原公开规则检查 `profilePath`，保留未知变量和真实合成文件内容。
无新状态、公共接口、跨模块依赖、UI 或数据迁移。

## 定向验收和交接

保留真实 Windows 失败摘录、实际受检 SHA 和相同源码摘要；原 Linux 两项本就
通过，不能声称在 Linux 重现了 Windows 失败。仅执行修复场景与新增 raw-spelling
场景，以及仓库要求的类型、lint、格式和 changed 架构检查，报告实际结果。
Linux 上的定向通过不替代真实 Windows CI；等待整合后的 matching Windows job。
全部系统命令经原 mock，文件只在 task-owned 临时目录，不运行 Chrome、模型或
用户电脑。原四个 production candidate、来源/许可记录与 frozen 原始材料不改。

修复提交先交整合。最终 Desktop 与发行包须待包含该提交及 zombie cleanup 的
新统一精确 SHA，再从源码重建；不把旧 ad712690 的中间包装结果改记为最终通过。
