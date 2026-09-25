# 设置页插件兼容性面板（T11 交付说明）

本文件记录 T11「Settings 兼容性面板」交付了什么、怎么验证、**没有**验证什么，以及如何回滚。
渲染规则的产品口径在 [插件兼容性规格](../specs/knorvia-plugin-compatibility.md) 的
「Settings 兼容性面板的渲染规则」一节；实现入口仍是设置页唯一的插件管理入口，没有新增页面、入口、
账号、付费或订阅界面。

## 面板显示什么

插件管理入口（`packages/ui/src/settings/PluginsSection.tsx`）里打开任一插件详情，在「高级信息」区内
有「兼容性」区块（`packages/ui/src/settings/PluginCompatibilitySection.tsx`）。它只读展示：

| 展示项           | 来源                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| 当前内核         | 固定为 `knorvia`：插件清单由 Knorvia 宿主物化（`pluginCompatibilityProjection.ts`）   |
| 声明文件路径     | 插件 `rootPath` + `.knorvia-plugin/compatibility.json`                                |
| 状态徽章         | `kernels[]` 中当前内核（无则回退 `*`）的 `status`，四值枚举                           |
| 作者理由         | 该内核条目的 `reason` 原文                                                            |
| 证据             | 仅当状态是 `verified` 时显示 `evidence`；无证据则空                                   |
| 所需能力（逐条） | `requires[]`，每条给出「可用 / 不可用 / 未验证」+ 机器可读原因码 + `whenMissing` 语义 |
| 阻塞提示         | `whenMissing: "refuse"` 且能力非可用时，明确标注「缺失时整个请求会被拒绝」            |
| 其他内核声明条数 | 除当前内核外的条目，仅作诊断展示                                                      |
| 空态/异常        | 缺文件、读取失败、JSON 非法、字段类型不符一律显示「未验证」+ 对应诊断                 |

关键行为：

- **未验证永远显示为未验证。** `declared` 显示为「已声明（未验证）」，`unknown` 显示为「未验证」；
  只有 `verified` 且带非空 `evidence` 才显示「已验证」。
- **可安装 ≠ 受支持。** 面板底部固定显示该提示；面板不安装、不启用、不执行、不修改 sidecar。
- **宿主没有上报的能力只能是「未验证」。** 当前只上报一项可核实的事实：插件已启用且宿主枚举到技能时
  `skills.enabled-catalog` 才算可用（依据 `specs/knorvia-shared-capabilities.md` 的有界投影结论）。
  其余能力（如 `filesystem.read`、`document.text-extraction`）宿主没有上报通道，一律「未验证」。
- **缺失/异常不崩。** sidecar 读取经宿主 `fileService.readTextFile`，失败时先 `checkFilesExist`
  区分「不存在」与「读取失败」；两者都投影为 `unknown`，不抛错、不阻塞插件页。

## 数据来源与读取链路

```text
插件根目录/.knorvia-plugin/compatibility.json
        │  fileService.readTextFile（已有的宿主文件读取链路，本地/远端各自落到对应 host）
        ▼
usePluginCompatibilityView（按插件 id + rootPath 缓存请求，详情打开时才读）
        │
        ▼
pluginCompatibilityProjection.resolvePluginCompatibilityView（纯函数，无 IO）
        │
        ▼
PluginCompatibilitySection（只渲染，不写回）
```

没有新增服务、没有新增 RPC、没有新增协议字段：`knorviaPluginInfoSchema` 保持 `.strict()` 不变，
`compatibility.json` 仍是唯一数据载体。

## 真实命令与结果

全部在仓库根目录 `D:\tools\knorvia-studio` 执行。基线提交 `6ee777d`（任务给定），
本次执行时 HEAD 为 `03c661e`（`6ee777d` 的子提交，Lead 的文档提交）；Node v26.3.0、pnpm 10.33.2。

| 命令                                                                                                                                                                                | 结果                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `node --experimental-test-module-mocks --import tsx --test packages/ui/test/plugin-compatibility-panel.test.ts`                                                                     | **10/10 通过**                               |
| 同一条命令一次跑 `plugin-compatibility-panel` + `cua-restricted-experiment` + `cuaRestrictedGate` + `plugin-settings-visibility` + `plugin-skill-packs` + `knorviaStorageIsolation` | **44/44 通过**                               |
| `pnpm i18n:check`                                                                                                                                                                   | `[i18n] en-US and zh-CN: 5415 matching keys` |
| `pnpm exec tsc -b packages/ui packages/services`                                                                                                                                    | 通过（无输出）                               |
| `pnpm typecheck`                                                                                                                                                                    | 退出码 0（含 `i18n:check`）                  |
| `pnpm lint`                                                                                                                                                                         | `Found 0 warnings and 0 errors`              |
| `node scripts/architecture/architecture-check.mjs check`                                                                                                                            | `architecture: OK / violations: 0`           |
| `pnpm exec oxfmt <上述 19 个改动文件>` 后 `--check`                                                                                                                                 | `All matched files use the correct format`   |

关于 `pnpm exec tsc -b packages/ui packages/services packages/cua`：**`packages/cua` 没有 tsconfig**
（它只有手写 `.js` + `.d.ts`，`package.json` 里没有 build/typecheck 脚本），因此 `tsc -b packages/cua`
没有可构建的工程。`packages/cua` 的类型面通过它的 `.d.ts` 导出被 `packages/services` 消费，
`tsc -b packages/services` 通过即代表 `restricted-gate.d.ts` 与 `broker-server.d.ts` 都被解析且一致。

## 本波明确**没有**验证

- **没有真实安装或启用**：面板只读声明文件，不调用 `installPlugin` / `setPluginEnabled`，
  也不代表任何插件已经被安装或启用。
- **没有真实模型运行**：没有调用任何模型，也没有验证模型是否会按技能契约行事。
- **没有按内核的运行时验证**：`compatibility.json` 的 `knorvia` 条目仍是 `declared`、通配条目仍是
  `unknown`；面板不会把声明显示成已验证。
- **没有渲染层自动化测试**：`packages/ui/test` 没有 DOM harness（无 jsdom / @testing-library），
  因此测试只覆盖纯投影模块（`pluginCompatibilityProjection.ts`、`cuaRestrictedExperiment.ts`），
  **没有**覆盖 React 渲染、样式与交互；面板的实际观感未做端到端验证。
- **没有验证 `examples/plugins/` 三个包在界面里的实际展示**：它们未被安装进本机插件清单，
  因此本波没有在真实列表里看到过这三个包的面板输出；面板逻辑由合成夹具覆盖。
- **远端 host 的 sidecar 读取未实测**：读取走既有 `fileService`，但未在真实 SSH 目标上跑过。

## 回滚

本波改动全部是新增文件 + 少量追加，回滚即按文件粒度撤销（不需要数据迁移、不留持久状态）：

1. 删除新增文件：`packages/ui/src/settings/pluginCompatibilityProjection.ts`、
   `usePluginCompatibility.ts`、`PluginCompatibilitySection.tsx`；
   `packages/ui/test/plugin-compatibility-panel.test.ts`；本文件。
2. 还原 `packages/ui/src/settings/PluginsSection.tsx`（去掉 `PluginCompatibilitySection` 的 import 与
   详情区渲染）和 `packages/ui/src/i18n/locales/{zh-CN,en-US}.ts`
   （删除 `settings.plugins.compatibility.*` 键）。
3. 还原 `specs/knorvia-plugin-compatibility.md` 与 `specs/knorvia-skill-contract.md` 的追加段落。

回滚后需要恢复的旧结论：`specs/knorvia-plugin-compatibility.md` 中「Settings 兼容性面板按波次故意推迟、
`compatibility.json` 今天没有任何界面消费方」的说法在回滚后重新成立。

## 遗留问题（不在本波写入范围，需 Lead 处理）

以下三处文档仍写着「兼容性面板已推迟 / `compatibility.json` 没有界面消费方」，与本波交付矛盾，
但它们不在本波的写入范围内，未作修改：

- `docs/knorvia-plugin-developer-guide.md:89`
- `docs/knorvia-plugin-skill-packs.md:120`
- `docs/knorvia-plugin-compatibility-matrix.md:77`

另外 `packages/ui/test/plugin-skill-packs.test.ts:471-472` 断言技能包文档必须出现
`推迟/deferred/未提供/不在本波` 字样，因此**修改** `docs/knorvia-plugin-skill-packs.md` 会连带影响该断言，
需要与测试一起调整。
