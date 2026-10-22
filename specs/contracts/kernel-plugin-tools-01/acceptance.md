# kernel-plugin-tools-01 验收

## 一、验收范围

本包交付 `cron` 族四个工具在 DSH 运行时上的实现：

| 交付物                | 路径                                                                   |
| --------------------- | ---------------------------------------------------------------------- |
| 插件入口              | `apps/cli/packages/bootstrap/src/kernel-plugin-tools-01/index.ts`      |
| 元数据工厂与常量      | `…/cron-declaration.ts`                                                |
| 执行体与投影          | `…/cron-execution.ts`                                                  |
| schema 与九条交叉约束 | `…/cron-schema.ts`                                                     |
| 契约测试（17 例）     | `apps/cli/packages/bootstrap/test/kernel-plugin-tools-01-cron.test.ts` |
| 合同                  | `specs/contracts/kernel-plugin-tools-01/**`                            |

## 二、门禁结果

| 检查                                     | 结果                         |
| ---------------------------------------- | ---------------------------- |
| `pnpm build:cli-packages`                | 0                            |
| `pnpm typecheck`                         | 0                            |
| `pnpm lint`                              | 0                            |
| `pnpm fmt` / `fmt:check`                 | 0 / 0                        |
| `pnpm provenance:report` / `--check`     | 0 / 0（`reviewProblems: 0`） |
| 契约测试（串行）                         | **17/17**                    |
| 相似度（4 个新文件 × 2 个旧对照 = 8 组） | **8/8 PASS**                 |
| `pnpm test:studio`                       | 交 CI                        |

## 三、相似度实测（双重口径，`beff12b5` 基线）

| 新文件                |   vs `cron.ts` | vs `cron-execution.ts` | 判定 |
| --------------------- | -------------: | ---------------------: | :--: |
| `cron-declaration.ts` | 0.179（run 2） |         0.179（run 2） |  ✅  |
| `cron-execution.ts`   | 0.083（run 2） |         0.083（run 2） |  ✅  |
| `cron-schema.ts`      | 0.125（run 6） |         0.125（run 6） |  ✅  |
| `index.ts`            | 0.118（run 1） |         0.118（run 1） |  ✅  |

**全部 < 0.20 且 run < 8**（门槛：containment < 0.20 / run < 8 / structural < 0.40）。

**命令**：

```bash
node --import tsx scripts/provenance/similarity.mjs \
  --candidate apps/cli/packages/bootstrap/src/kernel-plugin-tools-01/<file> \
  --old apps/cli/packages/core/src/tool/handlers/<old> \
  --old-rev beff12b5 \
  --upstream-dir <zcode-树> --upstream-rev 872ad960...
```

**⚠️ 关于「两个 old 给出相同数值」**：`cron-declaration.ts` / `cron-schema.ts` / `index.ts`
对两个 old 的 containment 相同（0.179 / 0.125 / 0.118）。已单独复测确认**不是工具问题**：
它们与两个 old 都只有「散落的短行」雷同（`return {` / `deleted,` 之类），而两个 old 都有这些短行，
所以数值巧合相同。`--explain` 的命中行内容不同。

## 四、旧实现的 29 项语义对照

### 4.1 `CronCreate` 的 11 条模型指令

|  #  | 旧指令的约束                                                                        | 新实现位置                             |  等价性  |
| :-: | ----------------------------------------------------------------------------------- | -------------------------------------- | :------: |
|  1  | 仅在用户明确要求排期时使用                                                          | `index.ts` CREATE_GUIDANCE[0]          |    ✅    |
|  2  | 相对延迟必须走 `delayMinutes`，绝不自己换算成 cron/时刻                             | CREATE_GUIDANCE[1]                     |    ✅    |
|  3  | 一次性相对延迟若自算时刻，刚过去会被 host 滚到下一整年                              | CREATE_GUIDANCE[1]（同一句的原因从句） | ✅ 合并  |
|  4  | `cron` 用用户本地时区，不转 UTC                                                     | CREATE_GUIDANCE[2]                     |    ✅    |
|  5  | 每 N 单位必须同时给 `intervalUnit` + `interval`（1–200）                            | CREATE_GUIDANCE[3]                     |    ✅    |
|  6  | 只有用户点名的绝对墙钟日期才 pin 月/日/时/分                                        | CREATE_GUIDANCE[4]                     |    ✅    |
|  7  | `recurring=false` + `maxRuns=N` 表恰好 N 次；`recurring=true` 不得与 `maxRuns` 组合 | CREATE_GUIDANCE[5]                     |    ✅    |
|  8  | `prompt` 写最终工作，绝不要求创建另一个自动化                                       | CREATE_GUIDANCE[6]                     |    ✅    |
|  9  | `title` 保留用户的自然语言排期短语                                                  | CREATE_GUIDANCE[7]                     |    ✅    |
| 10  | 输入不含 workspace 路径或身份                                                       | CREATE_GUIDANCE[7]（同句）             | ✅ 合并  |
| 11  | 遵循用户给定时刻，不加 jitter、不平移                                               | 约束表 `interval-within-range` + 文档  | ⚠️ 见 D4 |

**⚠️ 第 11 条的差异**：旧实现有独立的 modelInstructions 条目「Honor exact user-provided times
without adding jitter or shifting the schedule」；本包把它并入 `cron` 字段的说明，
**未单列为一条指令**。若审查认为这会让模型更容易加 jitter，应补回独立条目。

### 4.2 `CronCreate` 的 9 条交叉约束

|  #  | 旧 `.refine()` 的 message                                                           | 新实现（约束名）                    |      等价性       |
| :-: | ----------------------------------------------------------------------------------- | ----------------------------------- | :---------------: |
|  1  | cron is required when delayMinutes is not set                                       | `cron-required-without-delay`       |        ✅         |
|  2  | a relative delay must omit cron; the host computes the schedule from its real clock | `relative-delay-omits-cron`         |        ✅         |
|  3  | a relative delay creates a one-shot automation and cannot use recurring=true        | `relative-delay-is-one-shot`        |        ✅         |
|  4  | a relative delay runs once and cannot use maxRuns                                   | `relative-delay-has-no-max-runs`    |        ✅         |
|  5  | intervalUnit is a recurring carrier and cannot combine with a relative delayMinutes | `interval-unit-excludes-delay`      |        ✅         |
|  6  | intervalUnit and interval must be set together                                      | `interval-unit-pairs-with-interval` |        ✅         |
|  7  | intervalUnit is a recurring carrier and requires recurring=true                     | `interval-unit-requires-recurring`  |        ✅         |
|  8  | intervalUnit is a recurring carrier and cannot combine with maxRuns                 | `interval-unit-has-no-max-runs`     |        ✅         |
|  9  | （无对应 refine：`interval` 的 1–200 由字段 schema 的 `.min(1).max(200)` 承担）     | `interval-within-range`             | ✅ 提升为具名约束 |

**⚠️ 第 9 条的差异**：旧实现把范围交给 zod 字段级 `.min(1).max(200)`；
本包把它提升为具名交叉约束（因为 DSH 的 `ValueSchemaSpec` 没有 `min`/`max`）。
**语义等价，但报错时机不同**：旧实现是字段校验阶段，本包是执行体入口。

### 4.3 八个字段与判定口径

| 项                      | 旧实现                                                | 新实现                                       |            等价性             |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------- | :---------------------------: |
| `cron`                  | `trimmedText.optional()` + 400 字描述                 | `{ type: "string" }` + 说明                  | ⚠️ 见 D4（描述并入 guidance） |
| `delayMinutes`          | `int().positive().max(525_600).nullable().optional()` | `{ type: "number" }`                         |            ⚠️ 见下            |
| `prompt` / `title`      | `trimmedText`（trim + 非空）                          | `{ type: "string" }` + 执行体校验            |            ⚠️ 见下            |
| `recurring` / `maxRuns` | `boolean` / `int().positive()`                        | `boolean` / `number`                         |            ⚠️ 见下            |
| `intervalUnit`          | `z.enum([6 项])`                                      | `{ type: "string" }` + `CRON_INTERVAL_UNITS` |            ⚠️ 见下            |
| `interval`              | `int().min(1).max(200)`                               | 具名约束 `interval-within-range`             |              ✅               |
| 相对延迟判定            | `typeof delay === "number"`                           | 同                                           |              ✅               |

**⚠️ 这些 ⚠️ 有同一个原因**：DSH 的 `ValueSchemaSpec` **只有 `type` / `enum` / `const`
与四个注解字段，没有 `min` / `max` / `minLength` / 变换**。
所以旧实现靠 zod 做的「trim、非空、正数、上限」在本包移到了**执行体**。

**⚠️ 这是本包最大的行为风险点**：

| 校验                             | 旧实现（zod，字段阶段） | 本包（执行体，入口阶段）   | 差异                   |
| -------------------------------- | ----------------------- | -------------------------- | ---------------------- |
| `prompt` / `title` 全空白        | `parse` 失败            | 需要显式 `rejectBlankText` | **本包尚未接入该检查** |
| `delayMinutes` 负数 / 超 525_600 | `parse` 失败            | 需显式校验                 | **本包尚未接入**       |
| `maxRuns` 非正整数               | `parse` 失败            | 需显式校验                 | **本包尚未接入**       |
| `intervalUnit` 非枚举值          | `parse` 失败            | 需显式校验                 | **本包尚未接入**       |

**⚠️ 结论：本包当前只实现了「九条交叉约束」，字段级校验（非空、范围、枚举）尚未接入。**
**这是已知缺口，必须在实现 PR 合并前补齐**，否则非法输入会流到端口。

### 4.4 四态输出与投影

| 项                | 旧实现                                                | 新实现                               |  等价性  |
| ----------------- | ----------------------------------------------------- | ------------------------------------ | :------: |
| `CronCreate` 输出 | `{ automation, message: "Created automation <id>." }` | 同                                   |    ✅    |
| `CronUpdate` 输出 | `{ automation, message: "Updated automation <id>." }` | 同                                   |    ✅    |
| `CronList` 输出   | `{ automations }`                                     | 同                                   |    ✅    |
| `CronDelete` 输出 | `{ deleted, id, message }`（含「not found」分支）     | 同                                   |    ✅    |
| 投影字段          | 12 个白名单                                           | 排除 2 个后的全量                    | ⚠️ 见 D1 |
| 创建上限错误      | `AutomationCreateLimitError` 透传                     | 翻译成带同错误码的 `Error` + `cause` |    ✅    |
| 自动化轮次拒绝    | 宿主 `rejectAutomationTurn`                           | 读 `metadata.automationTurn`         | ⚠️ 见 D6 |

## 五、未覆盖（交 `kernel-switch` 或后续包）

| 项                                   | 为什么未覆盖                                               |
| ------------------------------------ | ---------------------------------------------------------- |
| 真实定时触发（cron 到点真的唤醒）    | 需要宿主调度器与真实时钟；离线只断言「创建后记录形状正确」 |
| 跨重启的持久化                       | 端口的落库由宿主实现；本包只测「调了端口且参数正确」       |
| 审批 UI 的端到端                     | 审批由 `dsh-user-approval` 与 `kernel-plugin-policy` 承担  |
| `off-peak` 2 个 + 会话/计划 3 个工具 | 属 `kernel-plugin-tools-02`                                |
| 真实 `AutomationPort` 实现           | 归 `kernel-bridge-02/03` 或宿主                            |

## 六、范围变更记录

见 [README.md](README.md) §七。要点：`#288` 原定 bash 族 31 文件已被 `#169` 覆盖，
本包改为 cron 族 4 个工具。
