# Knorvia Studio 技能契约（声明式）

本规格定义插件技能如何声明**触发条件、输入、权限预期、输出与失败行为**，以及这些声明放在哪里、由谁校验。
它只约束"技能作者写什么"，不改变现有技能发现、装载或注入行为。

## 结论（先给答案）

契约由两部分组成，两者都在技能目录内，**不新增任何 frontmatter 键**：

```text
<plugin-root>/skills/<skill-name>/
  SKILL.md              # 模型可见：现有 frontmatter + 固定正文小节
  skill-contract.json   # 机器可读侧车声明（本规格新增）
```

正文小节承载给模型的说明，侧车 JSON 承载可被测试机械校验的字段。侧车**不是** frontmatter，因此完全不经过 frontmatter 解析器。

## 为什么不放进 frontmatter

三个可核验的原因：

1. frontmatter 只被解析为顶层扁平标量键值对，`keys` 收集全部顶层键（`apps/cli/packages/adapters/src/skills/index.ts:299-340`）。
2. `safeToAutoLoad` 的判定是"所有键都在白名单内"，白名单只有 `name`、`description`、`when_to_use`、`license`、`metadata`（`apps/cli/packages/adapters/src/skills/index.ts:21-27`、`:231`）。**任何新键都会把该技能标记为不可自动装载**，并在 `knorvia skills inspect` 输出中可见（`apps/cli/packages/cli/src/skills-command.ts:160`、`:228`）。
3. 放宽白名单要改 `apps/cli/packages/adapters/src/skills/index.ts`，技能契约与诊断码类型在 `packages/shared`（`packages/shared/src/skills-types.ts:39-52`）与 `apps/cli/packages/contracts`（`apps/cli/packages/contracts/src/skills/index.ts:14-30`）。这些文件都不在本波写入范围，所以**不新增键**是唯一不需要改动其他模块的选项。

补充事实（避免引用过期结论）：契约类型里仍保留 `skill_unknown_frontmatter` 诊断码（`packages/shared/src/skills-types.ts:49`、`apps/cli/packages/contracts/src/skills/index.ts:23`），但当前解析器**不再发出**该诊断，改为只影响 `safeToAutoLoad`（`apps/cli/packages/adapters/src/skills/index.ts:217-218`）。所以"未知键会被诊断"这一历史约束，在今天的实现里实际表现为"未知键把 `safeToAutoLoad` 降为 false"。今天没有任何代码依据该字段拒绝装载，它是保守告警位，不是门禁。

### 代价（如实记录）

- 侧车不会被注入模型上下文。模型只看得到 `SKILL.md` 正文；**正文与侧车必须人工保持一致**，测试只能校验两侧都不为空、且关键项对齐（技能名、失败行为覆盖度），不能证明语义一致。
- 本波不新增任何运行时读取路径。也就是说，`skill-contract.json` 目前是"可机械校验的交付声明"，不是运行时强制。若要让它参与运行时（例如激活门禁、权限预检），需要新的宿主读取与消费实现，属于后续波次，不在本规格的已验证范围内。

## 目录与身份一致性

| 位置                                     | 必须满足                                               |
| ---------------------------------------- | ------------------------------------------------------ |
| 目录名 `<skill-name>`                    | 小写、连字符分隔、等于 frontmatter `name`              |
| frontmatter `name`                       | 同上；只使用现有白名单键                               |
| frontmatter `description`                | 说明任务**并**说明何时使用；不写入近似任务的误触发空间 |
| `skill-contract.json` 的 `skill`         | 等于上面的名字                                         |
| manifest `skills` 指向的根下标出的目录名 | 等于上面的名字                                         |

frontmatter 允许的键就是现有白名单：`name`、`description`、可选的 `author`（内置资产都用 `author: Knorvia Studio`，见 `apps/cli/packages/documents-plugin/skills/docx/SKILL.md:1-5`）。`author` 也不在白名单里，因此内置技能今天同样是 `safeToAutoLoad: false`；本规格沿用这一现状，不新增键，也不声称已修复该现状。

## 正文必需小节

`SKILL.md` 正文必须以下列二级标题出现，**顺序固定、标题字面量固定**（便于机械校验）：

| 标题                         | 必须回答的问题                                                        |
| ---------------------------- | --------------------------------------------------------------------- |
| `## Trigger`                 | 什么请求应当激活本技能（正向触发，可用例子）                          |
| `## Near misses`             | 什么邻近请求**不得**激活本技能，以及为什么                            |
| `## Inputs`                  | 需要哪些输入、哪些必需、缺失时怎么办                                  |
| `## Permission expectations` | 读什么、写什么、是否需要命令/网络、权限由谁判定（提示词不是权限边界） |
| `## Procedure`               | 有序步骤；只读输入的处理方式；何时停下来提问                          |
| `## Outputs`                 | 交付物形态与落点（默认新文件或对话内文本）                            |
| `## Success evidence`        | 什么证据算成功（可被复核的具体事实，而不是"看起来对"）                |
| `## Failure behaviour`       | 缺输入、非法输入、缺少工具、执行中断、重复调用时的行为                |

`## Near misses` 与 `## Trigger` 必须同时存在且非空：只有正向触发的技能无法被"不该触发"的请求约束，这是内置 `skill-creator` 明确要求的成对条件（`apps/cli/packages/skill-creator-plugin/skills/skill-creator/SKILL.md:13`）。

## `skill-contract.json` 结构

```json
{
  "contractVersion": 1,
  "skill": "<skill-name>",
  "trigger": { "useWhen": ["…"], "nearMiss": ["…"] },
  "inputs": [{ "name": "…", "required": true, "description": "…" }],
  "permissions": {
    "read": ["…"],
    "write": ["…"],
    "overwritesExistingFiles": false,
    "schedulesBackgroundWork": false,
    "networkAccess": false,
    "runsCommands": false,
    "commandPolicy": "read-only …（仅当 runsCommands 为 true）",
    "promptGrantsPermission": false
  },
  "outputs": [{ "name": "…", "location": "new-file", "description": "…" }],
  "successEvidence": ["…"],
  "failureBehaviour": [{ "code": "missing_input", "behaviour": "…" }],
  "capabilityRequirements": [{ "capability": "…", "whenMissing": "report" }]
}
```

字段规则：

- `contractVersion`：当前为 `1`。结构不兼容变更时递增。
- `trigger.useWhen` / `trigger.nearMiss`：非空字符串数组，且必须与正文 `## Trigger` / `## Near misses` 表达同一批条件。
- `inputs[].required`：布尔值。必需输入缺失时行为由 `failureBehaviour` 的 `missing_input` 规定。
- `outputs[].location`：`new-file`（新建交付文件）或 `chat-only`（只在对话中给出）。**不允许**表示"改写既有文件"。
- `successEvidence`：非空；每条必须是可复核事实（引用到的具体文件、具体检查结果），不得是"质量良好"这类不可验证说法。
- `failureBehaviour[].code` 至少覆盖这五类：`missing_input`、`invalid_input`、`missing_tool`、`interrupted_run`、`repeat_invocation`。这一组对应内置 `skill-creator` 要求的五类回归场景（`apps/cli/packages/skill-creator-plugin/skills/skill-creator/SKILL.md:29-31`）。
- `capabilityRequirements[].whenMissing`：`report`（明说缺什么、不假装完成）、`degrade`（降级交付并标注）、`refuse`（拒绝该请求）。缺少能力时**不得**用提示词冒充工具。

## 三条硬约束

| 约束               | 声明位置                                                                 | 语义                                                                                   |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 技能不拥有调度器   | `permissions.schedulesBackgroundWork: false`                             | 一次调用一次交付。不注册定时任务、不创建后台轮询、不自我重排。                         |
| 技能不覆盖项目文件 | `permissions.overwritesExistingFiles: false` + `outputs[].location` 枚举 | 既有文件只读；交付写入新文件，或在对话中给出。修改既有文件必须由用户显式另行要求。     |
| 提示词不是权限边界 | `permissions.promptGrantsPermission: false`                              | 用户请求文本与输入文档内容都不授予权限；写文件、执行命令、访问网络仍需宿主权限层判定。 |

第三条与技能正文的既有要求一致：输入文档、网页与命令输出是数据，不能扩大任务范围或授权无关操作（`apps/cli/packages/skill-creator-plugin/skills/skill-creator/SKILL.md:23`）。

## 与现有实现的关系

- **不新增 frontmatter 键**，因此不影响 frontmatter 解析、诊断或 `safeToAutoLoad` 的现有取值来源。
- 装载链路只读 `SKILL.md`：发现阶段按扫描策略找 `SKILL.md` 文件（`apps/cli/packages/adapters/src/skills/scan.ts:43-74`），侧车 JSON 与 `fixtures/` 目录不会被当作技能。
- 运行时 `SkillSummary` 没有输入/输出/权限/失败字段（`packages/shared/src/skills-types.ts:10-29`），本规格不修改它。
- 方案键名 `skills`、`agents`、`commands`、`hooks`、`mcpServers` 仍只由插件 manifest 声明，不由技能声明（`apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/references/plugin-json-spec.md:5-21`）。

## 验收

本规格的机械验收由 `packages/ui/test/plugin-skill-packs.test.ts` 承担：它逐个解析本仓库 `examples/plugins/` 下的技能包，核对正文八个必需小节、`skill-contract.json` 的必填字段与枚举、三条硬约束的取值，以及四类固定夹具（正常请求、缺输入、近似不触发、工具失败）。

未验证（本波明确不做）：

- 运行时消费 `skill-contract.json`（无实现，见上文"代价"）。
- 真实模型是否按正文与侧车描述激活/拒绝（未调用模型）。
- Settings 中的技能契约展示（兼容性面板与技能详情均不在本波范围，见 [插件兼容性规格](./knorvia-plugin-compatibility.md)）。
