# Knorvia Studio 插件技能包兼容性矩阵

本文件逐包、逐能力记录 `examples/plugins/` 下三个技能包的**声明状态**与**实际验证状态**。
规则见 [插件兼容性声明](../specs/knorvia-plugin-compatibility.md)：没有真实运行证据一律写"未验证"，不得写"已验证"。

## 当前验证边界（截至 2026-09-27）

- 三个包已通过真实 Windows 打包程序的本地来源安装、启停、安装字节、只读兼容性面板和跨进程重开验收，结果 **5/5 通过，退出码 0**。这是宿主安装与目录枚举的证据；没有在任何内核上执行技能，所有内核的运行列仍是"未验证"。
- 静态校验包括 `packages/ui/test/plugin-skill-packs.test.ts`（清单解析、路径存在性、许可正文、契约字段、四类夹具、无凭据与绝对路径），以及插件创建器的只读预检。静态校验与打包安装验收均**不证明**技能在模型上被正确激活或遵循。
- 这三个包**不在**内置插件清单里，也没有进入桌面包：`official-plugin-definitions.ts` 与 `official-plugin-staging.mjs` 都不包含它们的名字，因此默认启用集合与打包产物都没有变化（该断言由测试机械复核）。
- 可安装 ≠ 受支持：本地来源登记成功、插件出现在列表里、插件已启用，都不能推出"某内核上可用"。

## 内核口径

内核 id 以宿主内核目录为准（`packages/ui/src/studio/types.ts:13-30`，身份定义方是 services：`packages/services/src/studio-runtime/kernelTypes.ts:3-22`）：

| 列            | 包含的内核                                                                                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Knorvia 内核  | `knorvia`                                                                                                                                                                                                                                       |
| 外部 CLI 内核 | `codex`、`claude-code`、`grok-build`、`opencode`、`qoder`、`qoder-cn`、`hermes`、`qwen-code`、`mistral-vibe`、`deepseek-harness`、`antigravity`、`goose`、`kimi-cli`、`copilot`、`devin`、`cursor`、`factory-droid`、`cline`、`auggie`、`junie` |
| 自定义 ACP    | `acp:<name>`                                                                                                                                                                                                                                    |
| 远程内核      | `ssh:<id>:<kernel>`（含上述任一内核）                                                                                                                                                                                                           |

状态含义：**已声明** = 作者声明形态，无该内核执行证据；**未验证** = 未做过该内核上的技能运行验证；**不支持** = 已知不可用；**已验证** = 有可复核的运行证据（当前内核运行列为空）。宿主安装、界面与目录枚举证据单独注明，不提升包级或内核运行状态。

## 逐包 × 内核

| 技能包                   | Knorvia 内核       | 外部 CLI 内核 | 自定义 ACP | 远程内核 |
| ------------------------ | ------------------ | ------------- | ---------- | -------- |
| `project-handoff`        | 已声明；运行未验证 | 未验证        | 未验证     | 未验证   |
| `material-organizer`     | 已声明；运行未验证 | 未验证        | 未验证     | 未验证   |
| `document-quality-check` | 已声明；运行未验证 | 未验证        | 未验证     | 未验证   |

三个包的 `.knorvia-plugin/compatibility.json` 都带一条 `{"kernel": "*", "status": "unknown"}` 兜住其余内核；通配条目按规格只能是 `unknown` 或 `unsupported`。

## 逐包 × 能力

能力名取自各包 `skills/<name>/skill-contract.json` 的 `capabilityRequirements` 与插件级 `requires`。

### `project-handoff`

| 能力                                 | Knorvia 内核                   | 其他内核 | 说明                                                                      |
| ------------------------------------ | ------------------------------ | -------- | ------------------------------------------------------------------------- |
| `skills.enabled-catalog`（技能可见） | 宿主枚举已验证；技能运行未验证 | 未验证   | 打包界面确认启用时 available、禁用时 unverified；目录可见不等于技能被遵循 |
| `filesystem.read`（读选定项目）      | 已声明                         | 未验证   | 缺该能力时 `report`：明说缺什么、不伪造证据                               |
| `version-control.read-only`          | 已声明                         | 未验证   | 缺该能力时 `degrade`：跳过变更历史章节并标注"未检查"                      |
| 写一个**新**交接文档                 | 已声明（`new-file`，不覆盖）   | 未验证   | 写入仍需宿主工具权限层判定                                                |
| Hook / 命令 / 子代理 / MCP           | 不支持（本包未声明）           | 不支持   | 跨内核不执行；本包因此不携带这些组件                                      |

### `material-organizer`

| 能力                            | Knorvia 内核                   | 其他内核 | 说明                                                         |
| ------------------------------- | ------------------------------ | -------- | ------------------------------------------------------------ |
| `skills.enabled-catalog`        | 宿主枚举已验证；技能运行未验证 | 未验证   | 同上                                                         |
| `filesystem.directory-listing`  | 已声明                         | 未验证   | 缺该能力时 `report`                                          |
| `filesystem.read`（读资料内容） | 已声明                         | 未验证   | 缺该能力时 `degrade`：只能给"仅文件名"的索引，且必须显式标注 |
| 移动 / 重命名 / 删除资料        | 不支持（本包明确不做）         | 不支持   | 技能只产出建议，落地是用户另行确认的动作                     |
| Hook / 命令 / 子代理 / MCP      | 不支持（本包未声明）           | 不支持   | 同上                                                         |

### `document-quality-check`

| 能力                        | Knorvia 内核                   | 其他内核 | 说明                                                                         |
| --------------------------- | ------------------------------ | -------- | ---------------------------------------------------------------------------- |
| `skills.enabled-catalog`    | 宿主枚举已验证；技能运行未验证 | 未验证   | 同上                                                                         |
| `document.text-extraction`  | 已声明                         | 未验证   | 缺该能力时 `report`：不写任何 findings，也不从文件名推测                     |
| `filesystem.read`           | 已声明                         | 未验证   | 缺该能力时 `report`                                                          |
| 版式 / 分页 / 宏 / 公式求值 | 不支持（不在检查范围）         | 不支持   | 文本级检查看不到这些维度；报告必须把它们列进"未检查"，不得声称"版式没有问题" |
| Hook / 命令 / 子代理 / MCP  | 不支持（本包未声明）           | 不支持   | 同上                                                                         |

## 已关闭的安装与面板缺口（2026-09-27）

验收程序：`scripts/studio-plugin-install-acceptance.mjs`。使用仓库外完整包 `D:/tools.cache/knorvia-candidate-20260927/win-unpacked/Knorvia Studio.exe`（`0.8.0-preview.3`），记录 resources 路径以及 exe、`app.asar`、包内 CLI 的 SHA-256。三个包均经过页面安装、启用/禁用和安装文件字节核对；兼容面板实际渲染并保持 `declared`，宿主技能枚举随启用状态变化。

重开前保留 `document-quality-check` 禁用、另两个包启用，原进程退出后重新启动仍为两启用一禁用。结果 **5/5 通过，退出码 0**，`pageErrors=[]`、`resourceErrors=[]`。本机结果：`C:/Users/17018/AppData/Local/Temp/knorvia-plugin-install-qSHxyU/result.json`；详见 [打包验收记录](./knorvia-packaged-acceptance-20260927.md) 与 [技能包交付说明](./knorvia-plugin-skill-packs.md)。全部数据位于临时隔离根，各包 `compatibility.json` 未改成 `verified`。

## 当前未验证清单

1. 任何内核上的真实执行、技能激活与拒绝行为，以及生成内容质量（未调用真实模型）。
2. 外部 CLI 内核与自定义 ACP 内核的技能投影是否让模型遵循这三个技能（未执行）。
3. `ssh:` 远程内核上的行为（未执行）。
4. `document.text-extraction` 对真实 DOCX/PDF/XLSX/PPTX 的可用性（未执行；文本抽取依赖会话中实际可用的工具）。
5. 除宿主已启用技能目录枚举之外，面板中的能力要求仍以静态声明或未验证状态显示；不能把页面显示正确当成文件读取、文本抽取或内核执行已获验证。

## 如何复核

```powershell
node --import tsx --test packages/ui/test/plugin-skill-packs.test.ts
node apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/validate-plugin.mjs examples/plugins/project-handoff
```

第一条复核静态声明（清单、契约、夹具、许可、无凭据）；第二条是只读预检，成功只说明结构与路径通过，**不表示**安装、启用或执行成功。

统一打包验收入口（指定仓库外完整包；安装、启停、面板及重开由页面执行，仍不调用真实模型）：

```powershell
pnpm test:studio:packaged '<仓库外完整包>/Knorvia Studio.exe'
```
