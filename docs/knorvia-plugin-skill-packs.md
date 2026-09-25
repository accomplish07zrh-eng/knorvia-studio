# Knorvia Studio 插件技能包交付说明

本文件记录 2026-09-25 交付的**三个示例技能包**、它们的安装方式、逐文件来源与许可、本轮实际执行的验证，以及明确未做的部分。
术语与规则见 [技能契约](../specs/knorvia-skill-contract.md) 与 [插件兼容性声明](../specs/knorvia-plugin-compatibility.md)；逐包逐内核状态见 [兼容性矩阵](./knorvia-plugin-compatibility-matrix.md)。

## 交付了什么

三个可直接作为**个人本地来源**安装的技能包，位于 `examples/plugins/`：

| 包                       | 技能                     | 做什么                                                             | 落点           |
| ------------------------ | ------------------------ | ------------------------------------------------------------------ | -------------- |
| `project-handoff`        | `project-handoff`        | 为指定本地项目写带来源的交接文档：现状、未完成项、下一步应验证什么 | 一个新交接文件 |
| `material-organizer`     | `material-organizer`     | 盘点指定目录的零散资料，按内容分类，产出索引与命名/整理建议        | 一个新索引文件 |
| `document-quality-check` | `document-quality-check` | 审阅指定文档的结构、一致性与完整性，产出带位置与严重级别的质量报告 | 一个新报告文件 |

每个包的目录结构一致（以 `project-handoff` 为例）：

```text
examples/plugins/project-handoff/
  .knorvia-plugin/plugin.json           清单：只有 skills，许可按 SEE LICENSE IN 引用
  .knorvia-plugin/compatibility.json    逐内核声明，默认全部未验证
  LICENSE.txt                           MIT 正文
  README.md                             包说明、安装步骤、不声称什么
  skills/project-handoff/SKILL.md       模型可见的正文（八个固定小节）
  skills/project-handoff/skill-contract.json  机器可读的契约侧车
  fixtures/                             五类固定夹具（开发用，不进 manifest）
```

`fixtures/` 是开发与复核材料，**故意不在 manifest 里声明**：插件创建器的只读预检只校验清单声明的组件路径，扫描链只识别 `SKILL.md`（`apps/cli/packages/adapters/src/skills/scan.ts:43-74`），所以夹具既不会被当成技能，也不会随安装进入能力面。若某天要把这些包提升为内置插件，官方 staging 的顶层白名单（`packages/desktop/scripts/official-plugin-staging.mjs:133-148`）不包含 `fixtures`，夹具会被丢弃——这是有意的。

## 为什么只有技能：不声明 hooks、commands、mcpServers、agents

三个包的 manifest 只声明 `skills`，这是为了让它们拿到最大的可移植性：

- 已启用技能按内核有界投影，是唯一存在跨内核路径的组件（`specs/knorvia-shared-capabilities.md:9-12`）。
- 插件 **Hook、私有命令、插件子代理不跨内核执行**（`docs/knorvia-plugin-developer-guide.md:60`）。
- `agents` 在宿主校验结果里属于 `diagnosticOnly`，`commands`、`hooks`、`mcpServers` 属于 `runnable`（`apps/cli/packages/bootstrap/src/protocol/plugins.ts:480-482`）。注意这是**宿主级组件种类**分类，与具体内核无关。
- `mcpServers` 只有在静态、标准、可安全转换时才可能投影到外部内核（`specs/knorvia-shared-capabilities.md:25`），带私有认证或动态变量的 MCP 无法安全投影。

结论：声明 hooks／commands／mcpServers／agents 会立刻引入"只能在 Knorvia 内核使用"的部分，而这三个包的目标是**结构清晰、可复核、可移植的说明性能力**。代价如实记录：只有技能的包不能自带可执行工具，因此像"文档文本抽取""目录列举"这类能力只能声明为对宿主能力的**依赖**（`capabilityRequirements`），缺失时按 `report` 或 `degrade` 处理，绝不用提示词冒充工具。

`packages/ui/test/plugin-skill-packs.test.ts` 会机械断言这三个包的 manifest 不含上述组件键；上面这段论证被删除或改名时，该断言依据的文档检查会一起失败。

## 安装（只走现有本地来源机制）

产品不提供独立插件市场页面。安装路径与 `docs/knorvia-plugin-developer-guide.md` 第三节一致：

1. 只读预检（不需要 CLI）：

   ```powershell
   node apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/validate-plugin.mjs examples/plugins/project-handoff
   ```

   预期输出 `{"schemaValidated":false}`。**这表示路径、清单与引用文件通过了只读预检，不表示安装、启用或执行成功。**

2. 登记本地来源索引（`marketplace.json` 必须是包目录的**同级**文件，索引才会把它认成自己的插件）：

   ```powershell
   node apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/upsert-dev-marketplace.mjs examples/plugins/project-handoff --marketplace-path examples/plugins/dev-marketplace.json --name-zh 项目交接 --description-zh 为指定本地项目生成带来源的交接说明
   ```

3. 在目标工作区的 **设置 → 插件 → 来源** 中添加第 2 步回显的 `marketplaceRoot`，刷新，安装，再启用。

   登记、安装、启用是**三个不同状态**，都不等于"在该内核上可用"。生成的 `dev-marketplace.json` 是本地开发产物；若不想跟踪它，不要提交。

三个包可以登记到同一个 `dev-marketplace.json`（逐个 upsert 会累积条目）。

## 逐文件来源与许可记录

许可口径：本次交付的**全部新文件都是本轮在本仓库内撰写的**，没有复制任何第三方文本、模板、图片或脚本。每个技能包的 `LICENSE.txt` 是 MIT 正文，署名 `Copyright (c) 2026 Knorvia Studio`，与仓库内既有新编写插件资产的许可正文一致（同一正文见 `apps/cli/packages/skill-creator-plugin/skills/skill-creator/LICENSE.txt:1-21`，其归属记录见 `docs/knorvia-plugin-license-audit.md`）。沿用产品署名不等于替代发布授权记录；本波不涉及任何第三方材料，因此没有需要保留的上游署名。

- 未使用 `examples/plugins/project-brief` 的 Apache-2.0 正文：该文件带 `Copyright 2026 Z.AI Co., Ltd`，把它复制到本轮新写文件会构成错误的版权归属声明。三个新包因此各自使用 MIT 正文。
- 未复制、未改编任何仓库外材料；`specs/knorvia-builtin-plugins.md:75` 要求的"文本检索无旧署名不能单独证明可分发权利"对本波不适用，因为本波没有搬运任何既有材料。

| 文件                                                                          | 性质                 | 许可与署名                                          |
| ----------------------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| `examples/plugins/project-handoff/.knorvia-plugin/plugin.json`                | 新写清单             | MIT（包内 `LICENSE.txt`），`author: Knorvia Studio` |
| `examples/plugins/project-handoff/.knorvia-plugin/compatibility.json`         | 新写兼容声明         | 同上                                                |
| `examples/plugins/project-handoff/LICENSE.txt`                                | MIT 正文（项目署名） | `Copyright (c) 2026 Knorvia Studio`                 |
| `examples/plugins/project-handoff/README.md`                                  | 新写包说明           | 同上                                                |
| `examples/plugins/project-handoff/skills/project-handoff/SKILL.md`            | 新写技能正文         | 同上                                                |
| `examples/plugins/project-handoff/skills/project-handoff/skill-contract.json` | 新写契约侧车         | 同上                                                |
| `examples/plugins/project-handoff/fixtures/*.json`（5 个）                    | 新写夹具             | 同上                                                |
| `examples/plugins/material-organizer/**`（同结构，共 11 个文件）              | 同上                 | 同上                                                |
| `examples/plugins/document-quality-check/**`（同结构，共 11 个文件）          | 同上                 | 同上                                                |
| `specs/knorvia-skill-contract.md`                                             | 新写规格             | 仓库根 LICENSE（Apache-2.0）                        |
| `specs/knorvia-plugin-compatibility.md`                                       | 新写规格             | 同上                                                |
| `docs/knorvia-plugin-skill-packs.md`                                          | 新写文档（本文件）   | 同上                                                |
| `docs/knorvia-plugin-compatibility-matrix.md`                                 | 新写文档             | 同上                                                |
| `packages/ui/test/plugin-skill-packs.test.ts`                                 | 新写测试             | 同上                                                |

每个包的文件总数：`plugin.json`、`compatibility.json`、`LICENSE.txt`、`README.md`、`SKILL.md`、`skill-contract.json`、5 个夹具 = 11 个文件。

## 验证与未验证

### 本轮实际命令与真实结果（2026-09-25，Windows，Node 由 `mise.toml` 指定）

| 命令                                                                                  | 真实结果                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --import tsx --test packages/ui/test/plugin-skill-packs.test.ts`                | **17 passed / 0 failed**（3 包 × 5 项 + 文档论证 + 未进包断言）                                                                                                                             |
| `node --import tsx --test packages/ui/test/plugin-settings-visibility.test.ts`        | 带 `TSX_TSCONFIG_PATH=packages/ui/tsconfig.json` 时 **1 passed / 0 failed**；不带该变量会因 `@/` 别名解析失败而报错                                                                         |
| `node …/plugin-creator/scripts/validate-plugin.mjs examples/plugins/<pack>`（3 个包） | 三次都输出 `{"schemaValidated":false}`，退出码 0（只读预检通过；**不代表**安装/启用/执行成功）                                                                                              |
| `upsert-dev-marketplace.mjs`（在系统临时目录对 3 个包的副本执行）                     | 三次 `changed:true`，生成含 3 个条目的本地来源索引；仓库内未生成 `examples/plugins/dev-marketplace.json`                                                                                    |
| `pnpm exec tsc -b packages/ui`                                                        | 退出码 0                                                                                                                                                                                    |
| `pnpm lint`                                                                           | `Found 0 warnings and 0 errors`（2668 files）；首次运行曾报出 2 个 `max-lines` 错误，全部位于本波未触碰的 `packages/ui/src/studio/workflow/*`，那是并发任务当时正在拆分的中间状态，随后消失 |
| `node scripts/architecture/architecture-check.mjs check`                              | `architecture: OK / violations: 0 / baseline: 0 / new: 0`，退出码 0                                                                                                                         |
| `pnpm exec oxfmt <本波文件>` 与 `pnpm exec oxfmt --check <本波文件>`                  | 36 files 格式化完成；`--check` 输出 `All matched files use the correct format.`                                                                                                             |

已执行的检查覆盖：

- `packages/ui/test/plugin-skill-packs.test.ts`：清单解析、路径存在性、许可正文与署名、正文八个必需小节、契约侧车字段与枚举、三条硬约束（不覆盖文件、不拥有调度器、提示词不是权限边界）、四类必需夹具、无凭据与绝对机器路径、以及"未被加入内置插件清单与打包白名单"。
- `packages/ui/test/plugin-settings-visibility.test.ts`：确认既有设置页插件可见性分区未被本波改动影响。
- 插件创建器的只读预检逐个包执行；并在临时目录用 `upsert-dev-marketplace.mjs` 验证本地来源登记可用（不写入仓库）。

未验证（**本轮明确未做**）：

1. **真实安装与启用**：没有在应用的设置页把这三个包加进本地来源、安装或启用。上面的安装命令只做了离线的预检与临时目录登记。
2. **真实模型行为**：没有调用真实模型，因此技能是否按 `## Trigger` / `## Near misses` 正确激活与拒绝、交接文档质量、索引分类质量、报告质量**全部未验证**。夹具描述的是"应当观察到什么"，不是运行记录。
3. **逐内核运行验证**：没有任何内核上的真实执行，矩阵中所有内核的运行列都是"未验证"。
4. **Settings 兼容性面板**：按波次**推迟**，本波不新增设置页 UI、不改 services 与 i18n 文案；`compatibility.json` 目前没有界面消费方，只有测试与文档消费它。
5. **打包与默认启用**：这三个包**没有**加入内置插件清单，也没有进入桌面包；因此默认启用集合与打包产物均未变化。这一点由测试断言机械复核（两个权威文件里都不出现包名）。

## 相关文档

- [技能契约](../specs/knorvia-skill-contract.md)：技能如何声明触发/输入/权限/输出/失败，以及为什么契约放在正文小节 + 侧车里而不是新 frontmatter 键。
- [插件兼容性声明](../specs/knorvia-plugin-compatibility.md)：按内核声明格式、状态枚举、"可安装 ≠ 受支持"、如何声明"需要本内核缺少的能力"。
- [兼容性矩阵](./knorvia-plugin-compatibility-matrix.md)：逐包逐能力的已验证/已声明/不支持/未验证。
- [十分钟做一个插件](./knorvia-plugin-developer-guide.md)：本文追加的一节指向上面三份文档。
