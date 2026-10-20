# services-02 已知差异（`studio-runtime` 契约层）

## K1 端口下沉：位置变更，签名不变

4 个端口文件从 `studio-runtime/app/` 移到 `studio-runtime/`：

| 原路径                        | 新路径                    |
| ----------------------------- | ------------------------- |
| `app/ports.ts`                | `ports.ts`                |
| `app/storePort.ts`            | `storePort.ts`            |
| `app/imagePort.ts`            | `imagePort.ts`            |
| `app/workspaceRuntimePort.ts` | `workspaceRuntimePort.ts` |

**签名零改动**（`interface.md` 逐条冻结）。**替换阶段保留旧路径的 re-export 壳**，使 94 处存量引用不必一次性迁移。
旧路径壳的约束：只许 `export *` / `export type *`，不得有逻辑、不得有本地声明（`ports.test.mjs` B8 断言）。

## K2 冻结快照优先于 `licensing/current-files.json`

合同基线时 `licensing` 仍把这 17 个路径记为继承文件（13 unreviewed + 4 original）。
**登记为 `original` 之后，以 `scope-files.json` 的冻结快照为准**；`licensingDrift()` 用于在基线阶段发现不一致。

## K3 示例文件是「测试夹具 + 编译期契约检查」，不是公开 API

`contract.example.ts` 有 1 处真实引用：

```ts
// packages/services/test/studio-review-attention-integration.test.ts:12
import { confirmPreparedWorkspaceReview } from "../src/studio-runtime/contract.example.js";
```

因此：

| 判断项       | 结论                                                         |
| ------------ | ------------------------------------------------------------ |
| 是否死代码   | **不是**（有测试使用）                                       |
| 是否公开 API | **否**                                                       |
| 是否删除     | **否**（删了会让该测试失去夹具，且它是契约类型的可编译示例） |
| 登记         | `original`（无上游对应）                                     |

**knip 豁免**：该文件的 9 个导出在 knip 中报为未使用，属**示例资产的预期结果**，按条目级忽略，不删除。

## K4 `contract.ts` 是聚合桶，不是纯契约声明

`contract.ts` 用 `export *` 聚合了 10 个契约模块**以及 3 个 `domain/` 模块**：

```ts
export * from "./domain/imageInput.js";
export * from "./domain/outputRef.js";
export * from "./domain/reference.js";
```

**这不是契约层的依赖边，而是入口聚合**：

- `export *` 在 ESM 里**确实会加载模块**（re-export 需要求值），所以严格说 `contract.ts` 依赖 domain 的加载；
- 但 `contract.ts` 的职责就是**聚合导出**（包内桶），它是入口而非契约声明；
- **契约层的独立性由 9 个纯声明文件 + 4 个端口文件（共 13 个）保证** —— 它们**不得通过值导入引用实现层**。

**B11 的准确范围**：13 个文件（9 声明 + 4 端口），排除 `contract.ts`（桶）、`module.ts`/`node.ts`（入口）、`contract.example.ts`（示例）。

**`services-03` 的 3 个 domain 模块（`imageInput`/`outputRef`/`reference`）被本包 `contract.ts` 聚合转发，模块本身的实现归 `services-03`**；`export *` 属入口聚合职责，逻辑分包下不构成跨包依赖。
**这是「逻辑分包」**（`services-01` 起就是如此：合同与 scope 按包划分，物理上仍在 `packages/services/src/` 同一目录树），
因此相对路径合法、包公开面（`src/index.ts` 的 `export *`）不变、`packages/ui` 等消费方无需改动。

**实测这 45 个符号的消费面**（`imageInput` 6 + `outputRef` 22 + `reference` 17）：
| 消费方式 | 处数 |
| --- | ---: |
| 直接 `import ... from ".../studio-runtime/contract.js"` 取这些符号 | **0** |
| 通过 `@knorvia/services` 根桶取这些符号 | **10（全部在 `packages/ui`）** |
| 直接 `import ... from ".../domain/{imageInput,outputRef,reference}.js"` | 多处（`app/`、`adapters/` 内部使用） |

**所以这 3 行的 `export *` 是必须保留的公开面**——删掉会让 `packages/ui` 的 10 个文件编译失败。

### 为什么把 `contract.ts` 归入本包（而不是拆成「纯声明 + 聚合」两个文件）

**`contract.ts` 是 `packages/services` 对外的契约出口**：`src/index.ts:231` 有 `export * from "./studio-runtime/contract.js"`，
即 `@knorvia/services` 根桶转发的就是它。**跨层聚合是它的定义职责，不是缺陷。**

**自身声明与转发的区分（重要）**：

| 类别                 | 内容                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| **自身声明（3 个）** | `StudioCommand`（约 40 行判别联合）、`StudioCommandResult`、`IStudioRuntimeService`（含运行时值） |
| **转发（14 项）**    | 9 个契约层模块 + 3 个 `domain/` + 2 项来自 `app/runOutcomeProjection.ts`                          |

**实测 26 处 `import ... from ".../contract.js"` 的取值构成**：

| 取值性质                       |  处数 |
| ------------------------------ | ----: |
| 只取自身声明（3 个符号）       | **5** |
| 混合（自身 + 转发）            |     7 |
| 只取转发符号                   | **7** |
| 其余（合计 19 处依赖转发符号） |     — |

**结论：`contract.ts` 的引用数（22–26 处）不等于它的核心度** —— 大部分引用是「把转发层当入口用」。
**若把它拆成「纯声明 + 聚合」两个文件，19 处引用要改路径，而收益仅是版面纯净度** —— 成本收益不成立，故**不拆分**。

## K5 三个 `domain/` 模块不纳入本包

`domain/imageInput.ts`（126 行）、`domain/outputRef.ts`（279 行）、`domain/reference.ts`（340 行）
**都含实质运行时逻辑**（共 799 行、30 个导出函数：校验、解码、解析、绑定），
因此**不能**移入契约层（会让契约层出现大量运行时逻辑，违反分层原则）。

它们归 `services-03`（domain 层）。`contract.ts` 对它们的聚合转发出 `services-03` 处理时一并评估。

## K6 类型导入不构成运行期依赖

9 个纯声明文件里有 3 处 `import type` 指向实现层：

```ts
// kernelTypes.ts:1
import type { StudioKernelProbe } from "./adapters/kernels/probeResult.js";
// workflowTypes.ts:2
import type { StudioOutputRef } from "./domain/outputRef.js";
```

**`import type` 在编译期被完全擦除**，不产生运行期依赖边，因此不违反 B11。
`kernelTypes.ts:221-222` 的两处 `export *`（指向 `adapters/`、`domain/`）属聚合转发，同 K4 口径。

## K7 桩检测不依赖桩的错误文案

`tests/typecheck.test.mjs` 的 B14 需要区分「当前加载的是真实实现还是合同桩」。
**最初用 `not implemented: services-02` 字符串匹配**，但那耦合了桩生成器的错误文案——
文案一改检测就失效而测试仍绿。

**现改为行为特征判定**（`tests/stub-probe.mjs`），三条信号任一命中即认定为桩：

1. **模块导入时直接抛错**（桩在顶层 `throw`）—— 真实模块不会；
2. **导出值全部为 `undefined`**（桩生成的 `const X: unknown = undefined`）；
3. **声明面非 0 但运行期导出为 0**（交由调用方结合 `role` 判断，因为纯类型模块本身运行期为空）。

这三条都是**实现行为**，与桩的文案无关。桩生成器将来改文案，这条断言仍然有效。

## K8 上游归属

`upstream-baseline.json`（6,973 个上游文件）在 `packages/services/src/studio-runtime` 下**零文件**；
`contract.example.ts` 在上游仅有同名但无关的 `.agents/skills/.../golden-module/contract.example.ts`（141 字节 vs 本文件 3,808 字节）。
本包 17 个文件登记 `original`。

## 红线清单（不可触碰）

1. 不复制、不改名、不逐行改写旧实现；
2. 不跳过、不把测试当允许失败、不放宽断言；
3. 不改相似度门槛；
4. 不做换名、再导出桩、压行等门禁作弊；
5. 不改数据格式、协议字段、环境变量、数据目录；
6. 不改 DSH 源码，不 fork；
7. 不往 main 推；
8. 不改别人的包；
9. 不写凭据、真实用户数据、内部服务地址到日志或示例。
