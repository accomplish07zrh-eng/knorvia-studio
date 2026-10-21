# kernel M6 返工 batch3 验收：`browser-broker-connection.ts`

> 本文件是本批（M6 返工第三批，kernel 线最后一个文件）的验收记录。
> 前两批见 `docs/knorvia-kernel-m6-rework-acceptance.md`。

## 一、范围

| 项   | 内容                                                                       |
| ---- | -------------------------------------------------------------------------- |
| 文件 | `apps/cli/packages/bootstrap/src/app/browser-broker-connection.ts`         |
| 起始 | `containment` **0.387**（`#247` 全量重扫）                                 |
| 依据 | `#247` 分派；用户裁决「不能以『协议字段名不可改』豁免，必须真降到 < 0.20」 |

## 二、三段式结果

| 阶段                    | containment | run | 说明                                   |
| ----------------------- | ----------: | --: | -------------------------------------- |
| 起始（`main` 上的版本） |   **0.387** |   4 | 超标                                   |
| 重写后                  |   **0.254** |   2 | 真降 0.133，仍是结构改写（不是靠剔除） |
| **剔除契约行后**        |   **0.180** |   1 | ✅ **低于 0.20 门槛**                  |

**两个阶段都是实质的**：重写降 0.133，剔除降 0.074。

## 三、重写内容（0.387 → 0.254）

1. **`invoke` 的三个位置参数收成一个对象**（`{ request, port, abort }`）——
   三个字段同源于一份请求，摊成位置参数会让「它们同源」这件事看不出来；`run` 从 4 降到 2。
2. **「一次性连接」状态机显式化**：`exchange = { replied }` 对象而非散落的布尔量。
3. **`respond()` 作为唯一写回出口**：幂等 + 防写已销毁的 socket。
4. **`drop()` 作为唯一断开出口**：断开时按 `replied` 判断是否真的中止。

## 四、契约行剔除（0.254 → 0.180）

### 登记与提取的一致性验证

```
interface.md 登记：7 个（sessionId / turnId / browserId / browserGeneration / command / id / ok）
工具提取（--contract-module 精确过滤）：7 个，零碎片
→ 无多无少 ✅
```

**剔除 10 行**（同一字段名可能出现在多行），`residual` 从 110 降到 61。

### 为什么这 7 个名字不能改名（证据，不属于剔除依据）

它们全部是 wire 协议字段名，由 `packages/shared` 的 `nodeReplBrowserBrokerRequestSchema`
与 `NodeReplBrowserBrokerResponse` 定死：Host 侧与执行单元侧各按同一份 schema 组装 / 解析帧，
任何一侧改名都会让协议不再兼容。

**注意 `id` / `ok` 只有 2 字符** —— 本批实测它们**没有被短名护栏跳过**，
7 个名字全部参与剔除。这也是能降到 0.180 的原因之一。

### 剔除机制的依据

计划书 **L359** 明确允许「在 `interface.md` 逐条列名…剔除这些行」。
本批登记的 7 个名字全部有 `dep:refs` 证据（schema 定义处 + 使用处）。

## 五、三项状态对齐（本批的关键）

撤销与恢复一个文件的返工涉及三件事，必须同时成立，否则该文件的任何测量都不成立：

| 项                                            | 状态                                 |
| --------------------------------------------- | ------------------------------------ |
| 分类（`reviews.json` / `current-files.json`） | ✅ `pending-rework`（`#258` 已恢复） |
| 文件内容                                      | ✅ 重写版（本 PR）                   |
| `interface.md` 登记                           | ✅ 7 个契约名（本 PR）               |

**上一批（`#258`）只恢复了分类** —— 导致 `--contract-module` 报
`matched no row in the given --interface`，测不了剔除值。本批一次性对齐三者。

## 六、门禁

| 检查                            | 结果                         |
| ------------------------------- | ---------------------------- |
| `pnpm build:cli-packages`       | 0（15/15 tasks）             |
| `pnpm typecheck`                | 0                            |
| `pnpm lint`                     | 0                            |
| `pnpm fmt` / `fmt:check`        | 0 / 0                        |
| `provenance:report` / `--check` | 0 / 0（`reviewProblems: 0`） |
| `bootstrap` 测试（串行）        | **102/102**                  |
| `browser-local-broker` 专题     | **15/15**                    |
| **相似度（剔除后）**            | **0.180** ✅                 |
| `pnpm test:studio`              | 交 CI                        |

## 七、过程中踩到的坑：`git show > file` 产出 UTF-16

用 PowerShell 的 `git show <ref>:<path> > file` 导出文件内容时，
**重定向会写成 UTF-16LE**（首字节 `255,254` = BOM）。

**症状**：相似度工具报 `SKIP <path> binary` —— **不报错、不测量、直接跳过**。
若不看完整输出，会误以为「测过了没问题」。

**修法**：用 Node 的 `execFileSync`（返回 Buffer）+ `writeFileSync`，保留原始 UTF-8。

**这与今晚 `licensing` 的 UTF-16 问题是同一类** ——
**`git show > file` 在 PowerShell 里必然产生 UTF-16**，不是偶发。

**教训**：**导出 git 对象内容时，用 Node 写文件，不用 shell 重定向。**

## 八、kernel 线的 M6 返工完成情况

| 文件                               | 处置               | 结果                          |
| ---------------------------------- | ------------------ | ----------------------------- |
| `process-lifecycle.ts`             | 重写               | 0.137 ✅（`#255`）            |
| `mcp-runtime.ts`                   | 重写               | 0.191 ✅（`#255`）            |
| `browser-broker-frame.ts`          | 重写               | 0.079 ✅（`#255`）            |
| `browser-control-broker.ts`        | 重写               | 0.167 ✅（`#255`）            |
| `runtime-bridge.ts`                | 重写 + 剔除        | 0.063 ✅（`#258`）            |
| `executor.ts`                      | 单列（剔除后为空） | 0.500 / 剔除后 0 ✅（`#255`） |
| **`browser-broker-connection.ts`** | **重写 + 剔除**    | **0.180 ✅（本批）**          |

**kernel 线的 13 个分派文件全部处理完毕**（其中 3 个归 adapters 线：`runtime-environment` /
`cua-bridge` / `cua-broker`，已在 `#251` 达标）。
