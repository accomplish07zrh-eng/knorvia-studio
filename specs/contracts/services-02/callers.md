# services-02 调用方分析

扫描方式：对 `packages/**` 与 `apps/**` 的 `.ts/.tsx/.mts/.cts` 做 import 说明符解析（相对路径归一 + `#src/*` 别名展开 + `.js`→`.ts`），匹配本包 17 个文件的路径。
原始数据：[`callers-raw.json`](callers-raw.json)。

## 一、总量

| 指标                               | 值         |
| ---------------------------------- | ---------- |
| 本包模块数                         | 17         |
| **引用合计**                       | **339 处** |
| **`packages/services` 之外的引用** | **0 处**   |

**关键结论：本包 17 个文件的引用全部落在 `packages/services/` 内**（`services/src` 与 `services/test` 两个作用域）。
没有任何 `packages/desktop`、`packages/server`、`packages/ui`、`apps/cli` 的直接引用。
这印证了端口下沉的影响面结论：94 处端口引用（以及全部 339 处契约引用）都在包内。

## 二、逐模块引用面

| 模块                    | 角色     |   引用 | services/src | services/test |
| ----------------------- | -------- | -----: | -----------: | ------------: |
| `kernelTypes`           | 声明     | **81** |           58 |            23 |
| `storePort`             | **端口** | **55** |           32 |            23 |
| `workflowTypes`         | 声明     |     44 |           33 |            11 |
| `types`                 | 声明     |     40 |           34 |             6 |
| `contract`              | 声明     |     37 |           19 |            18 |
| `ports`                 | **端口** |     29 |           20 |             9 |
| `agentToolTypes`        | 声明     |     15 |           12 |             3 |
| `workspaceReviewTypes`  | 声明     |      7 |            7 |             0 |
| `workspaceRuntimeTypes` | 声明     |      6 |            4 |             2 |
| `imagePort`             | **端口** |      5 |            5 |             0 |
| `workspaceRuntimePort`  | **端口** |      5 |            4 |             1 |
| `workspaceImageTypes`   | 声明     |      5 |            5 |             0 |
| `imageTypes`            | 声明     |      4 |            4 |             0 |
| `node`                  | 入口     |      3 |            2 |             1 |
| `attentionTypes`        | 声明     |      2 |            2 |             0 |
| `contract.example`      | 示例     |  **1** |            0 |             1 |
| `module`                | 入口     |  **0** |            0 |             0 |

### 端口四件合计

`storePort` 55 + `ports` 29 + `imagePort` 5 + `workspaceRuntimePort` 5 = **94 处**，
与 README 的影响面统计一致（全部在 `packages/services/` 内）。

## 三、两个需要单独说明的模块

### `contract.example.ts` —— 有 1 处引用，且**被真实测试使用**

先前判断「零引用」是错误的，实测有 1 处：

```ts
// packages/services/test/studio-review-attention-integration.test.ts:12
import { confirmPreparedWorkspaceReview } from "../src/studio-runtime/contract.example.js";
```

它导入的是示例文件里的 `confirmPreparedWorkspaceReview(draft: StudioReviewDraft): StudioCommand` ——
一个把审查草稿转成命令的**构造函数**。

**这改变了该文件的定性**：它不是「纯文档示例」，而是「**被测试用作测试夹具的示例**」。
因此：

| 判断项         | 结论                                                             |
| -------------- | ---------------------------------------------------------------- |
| 是否为死代码   | **不是**（有测试使用）                                           |
| 是否属公开 API | **否**（唯一使用者是测试，不是产品入口）                         |
| 是否可删除     | **不建议**（删了会让该测试失去夹具，且它是契约类型的可编译示例） |
| 如何登记       | `original`（无上游对应，见 README 与 register basis）            |

**`interface.md` 已标注「示例，非公开 API」**，本文件进一步说明它作为测试夹具的实际用途。

### `module.ts` —— 0 处引用

6 行的模块描述符。**没有任何内部引用者**。它可能是：

- 包级 `exports` 映射的入口（由 `package.json` 暴露，不经 import 语句）；
- 或历史遗留。

**处置**：本轮**不删**（删除需先确认 `package.json` 的 exports 不指向它），在替换阶段由 `export 面测试` 确认后再决定。
`interface.md` 已记录它的 1 项导出。

## 四、对替换阶段的意义

1. **改动面锁定在 `packages/services/` 内** —— 339 处引用零出包，替换不会波及 desktop/server/ui/cli；
2. **最强的两个耦合点是 `kernelTypes`（81）与 `storePort`（55）** —— 它们的签名一旦变，波及面最大；
3. **`services/test` 有 67 处引用**（23+23+11+6+18+9+3+2+1+1） —— 说明这 17 个文件也是**测试夹具的来源**，
   替换时不能只保证产品代码通过，还要保证这些测试继续能导入；
4. **端口的 94 处引用中 33 处在 `services/test`**（storePort 23 + ports 9 + workspaceRuntimePort 1）
   —— 旧路径 re-export 壳的必要性主要来自这里（一次性改测试 import 会让审查难以区分「改路径」与「改断言」）。
