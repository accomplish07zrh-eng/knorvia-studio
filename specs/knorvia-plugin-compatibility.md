# Knorvia Studio 插件兼容性声明

本规格定义插件如何声明**自己能在哪些内核上做什么、不能做什么、以及哪些还没验证**。
它同时定义"可安装 ≠ 受支持"的判定规则，以及插件如何声明"需要当前内核不具备的能力"。

## 事实基础（先排除错误假设）

- 全仓库**没有** `minKernelVersion`、`compatibleKernels` 之类的按内核兼容字段（全仓检索无命中）。任何声称"manifest 里有内核对齐声明"的说法都不成立。
- 当前唯一的机器可读兼容产物是插件校验结果：`knorviaPluginsValidateResultSchema.compatibility: { runnable[], diagnosticOnly[], unsupported[] }`（`packages/shared/src/protocol/index.ts:3302-3315`），由宿主在校验时**作为常量**填出（`apps/cli/packages/bootstrap/src/protocol/plugins.ts:476-484`）：
  - `runnable`：`skills`、`commands`、`hooks`、`mcpServers`、`userConfig`
  - `diagnosticOnly`：`agents`、`lspServers`、`outputStyles`、`channels`、`settings`
  - `unsupported`：`mcpb`、`dxt`、`npm`、`hostPattern`、`pathPattern`
- 该结果描述的是**宿主支持的组件种类**，与具体插件无关，也与内核无关。它**不能**用来回答"某插件在 Codex 上是否可用"。
- 跨内核规则目前只有散文：`docs/knorvia-plugin-developer-guide.md:56-61`（已启用技能按内核有界投影；Hook、私有命令、插件子代理不跨内核执行）与 `specs/knorvia-shared-capabilities.md:9-12`、`:25`。

结论：按内核的兼容性目前只能由**插件作者显式声明**，并由文档与测试机械校验其"是否标注为未验证"。本规格提供这个声明格式。

## 声明载体

```text
<plugin-root>/                                  # 插件级
  .knorvia-plugin/compatibility.json
  skills/<skill-name>/                          # 技能级
    skill-contract.json   → capabilityRequirements[]
```

两个文件都是**侧车**，都不新增 manifest 键。理由：manifest 读取器把 JSON 原样展开，不拒绝未知键（`apps/cli/packages/adapters/src/plugins/index.ts:940-950`、`apps/cli/packages/adapters/src/plugins/marketplace.ts:2180-2198`），所以多写键不会被拒；但未登记的键没有 schema、没有消费方，也无法被 `plugins validate` 覆盖，因此不作为契约载体。

## `.knorvia-plugin/compatibility.json`

```json
{
  "compatibilityVersion": 1,
  "plugin": "<plugin-name>",
  "components": {
    "skills": "required",
    "agents": "absent",
    "commands": "absent",
    "hooks": "absent",
    "mcpServers": "absent",
    "scripts": "absent"
  },
  "kernels": [
    { "kernel": "knorvia", "status": "declared", "reason": "…" },
    { "kernel": "*", "status": "unknown", "reason": "…" }
  ],
  "requires": [{ "capability": "…", "whenMissing": "report" }]
}
```

字段规则：

- `plugin`：等于 manifest `name`。
- `components`：取值 `required` / `optional` / `absent`，必须与 manifest 实际声明的组件一致；manifest 没声明的种类必须写 `absent`。这是"声明与包内容一致"的机械校验点。
- `kernels[]`：按内核逐条声明状态，见下节。必须包含一条 `"kernel": "*"` 的通配条目兜住其余内核。
- `requires[]`：插件运行需要的宿主能力；`whenMissing` 取值 `report` / `degrade` / `refuse`。

### 状态枚举（四值，只有四个）

| 状态          | 含义                                                                       | 允许条件                                                    |
| ------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `verified`    | 在**该内核的真实运行或该内核的官方校验**中取得过证据                       | 必须同时给出 `evidence`（非空字符串数组，指向可复核的产物） |
| `declared`    | 作者声明目标形态（例如"只有技能，按内核有界投影"），但没有该内核的运行证据 | 只能用于形态声明，不得写成"已支持"                          |
| `unsupported` | 已知在该内核不可用                                                         | 必须给出 `reason`                                           |
| `unknown`     | 未确定，或未做过验证                                                       | 必须给出 `reason`                                           |

硬规则：

- **没有证据不得写 `verified`。** 未做运行验证就写 `verified` 是造假；本仓库当前没有任何按内核的插件运行验证记录，所以本波新包的 `knorvia` 条目一律是 `declared`，通配条目一律是 `unknown`。
- 通配条目 `"kernel": "*"` 只允许 `unknown` 或 `unsupported`，不允许 `verified` / `declared`：通配无法承载证据。
- 内核 id 取自宿主内核目录（`packages/ui/src/studio/types.ts:13-30`）：`knorvia`、`codex`、`claude-code`、`grok-build`、`opencode`、`qoder`、`qoder-cn`、`hermes`、`qwen-code`、`mistral-vibe`、`deepseek-harness`、`gemini-cli`、`antigravity`、`goose`、`kimi-cli`、`copilot`，以及自定义 `acp:<name>`；内核身份的唯一定义方是 services（`packages/services/src/studio-runtime/kernelTypes.ts:3-22`）。

## 可安装 ≠ 受支持

以下四件事是**互相独立**的状态，界面、文档与错误信息都不得把它们混为一谈：

| 状态             | 由谁判定                                                                    | 不证明什么                                       |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| 结构预检通过     | 插件创建器的只读预检（`…/plugin-creator/scripts/validate-plugin.mjs:9-41`） | 不证明宿主接受、不证明启用、不证明执行           |
| 宿主 schema 通过 | 显式提供 CLI 绝对路径时的 `plugins validate`                                | 不证明技能质量，也不证明任何内核上能执行         |
| 已安装           | 本地来源索引 + 安装动作（`…/scripts/upsert-dev-marketplace.mjs:8-27`）      | 不等于已启用                                     |
| 已启用           | 插件启用配置                                                                | 不等于该内核支持其组件；Hook/命令/子代理不跨内核 |
| 已在某内核可用   | 只有该内核上的真实运行结果                                                  | ——                                               |

因此：**"装得上"永远不蕴含"完全支持"。** 文档与插件 `README.md` 必须写明这一点，兼容性矩阵必须把未验证项写成"未验证"。

## 插件如何声明"需要本内核缺少的能力"

两级声明，语义不同：

1. 插件级 `requires[]`：整个插件对宿主的能力要求，例如需要宿主的技能投影、需要只读文件检查工具。缺失时按 `whenMissing` 处理。
2. 技能级 `skill-contract.json` 的 `capabilityRequirements[]`（见 [技能契约](./knorvia-skill-contract.md)）：单个技能在运行时需要的能力，例如"文件读取""只读版本控制查询""文档渲染器"。

处理语义：

- `report`：明说缺哪个能力、哪个内核上缺失，并把任务标为未完成——**不得**用纯提示词冒充工具（与 `docs/knorvia-plugin-developer-guide.md:61`"无法安全投影时明确不可用，不用提示词冒充工具"一致）。
- `degrade`：交付降级结果，并在交付物里显式列出降级项。
- `refuse`：拒绝该请求，说明原因，不做替代性猜测。

禁用：插件不得通过提示词要求模型"假装"某能力存在，也不得把"插件已安装"当作能力已经具备的证明。

## 技能包的默认形态

新技能包一律选择**只有 `skills`** 的形态，理由可直接引用现有结论：

- 已启用技能按内核有界投影，是唯一有跨内核路径的组件（`specs/knorvia-shared-capabilities.md:9-12`）。
- Hook、私有命令、插件子代理**不跨内核执行**（`docs/knorvia-plugin-developer-guide.md:60`）。
- `agents` 在宿主校验里属于 `diagnosticOnly`（`apps/cli/packages/bootstrap/src/protocol/plugins.ts:481`）。
- MCP 只有在静态、标准、可安全转换时才可能投影（`specs/knorvia-shared-capabilities.md:25`）。

只有 `skills` 的包因此拿到最大的可移植性，代价是它只能提供说明性能力，不能自带可执行工具。这是有意识的取舍，必须在包 README 与矩阵中写明。

## 验收

- `packages/ui/test/plugin-skill-packs.test.ts` 机械校验：`compatibility.json` 可解析、`plugin` 与 manifest 一致、`components` 与实际 manifest 声明一致、状态值在四值枚举内、通配条目不是 `verified`、任何 `verified` 都带非空 `evidence`。
- `docs/knorvia-plugin-compatibility-matrix.md` 逐包逐能力列出"已验证 / 已声明 / 不支持 / 未验证"，未跑过的内核一律写未验证。

未验证（本波明确不做）：

- 任何内核上的真实安装、启用与执行（未执行）。
- Settings 兼容性面板：按当前波次安排**故意推迟**，本波不新增设置页 UI、不改 services 与 i18n 文案；`compatibility.json` 今天没有任何界面消费方。
