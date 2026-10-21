# services-03 已知差异（v1）

替代路径：`specs/contracts/services-03/README.md`。
本文档是**重写阶段的红线清单** —— 列出「新实现即使正确也必然不同」的实现差异面，
以及「必须逐字保持、严格不变」的协议与行为面。

---

## 1. 预登记差异（允许的实现层差异）

| 面           | 现状                                                                | 替换后要求                                         | 验证口径                                             |
| :----------- | :------------------------------------------------------------------ | :------------------------------------------------- | :--------------------------------------------------- |
| **文件组织** | 31 个文件平铺在 `studio-runtime/domain/`，`reference.ts` 399 行最大 | 按 `design.md` 的 8 个功能簇组织，**模块路径不变** | `interface.md` 的 31 个模块路径与 192 项导出逐条冻结 |
| **内部实现** | 当前实现（部分为继承）                                              | 全量自写，与旧代码完全不同                         | 两道相似度门槛通过（替换阶段）                       |
| **辅助函数** | 散在各文件内部                                                      | 集中在对应功能簇内组织，去除冗余重复声明           | 黑盒测试 25 用例 + 桩替换 `allFail`                  |

---

## 2. 必须逐字保持（红线清单，测试即守门）

### 2.1 模块路径与导出名

`interface.md` 列出的 **31 个模块路径**与**192 项导出**（运行时 161 / 纯类型 31）一字不改。

### 2.2 纯逻辑层不变量（B4–B7）

- **无 I/O**：不 import `node:fs` / `node:child_process` / `node:net` / `node:http` / `node:https` / `node:dgram` / `node:tls` / `node:worker_threads`；
- **无环境变量**：不出现 `process.env`；
- **无子进程**：不调用 `spawn` / `spawnSync` / `execFile` / `execFileSync` / `execSync` / `fork`；
- **无模块级可变状态**：不出现顶层 `let` / `var`。

### 2.3 依赖方向（B8–B9）

- **不向上依赖**：不 import `app/` 或 `adapters/`（值导入与类型导入都不允许）；
- **层内依赖边 ⊆ 21 条**（`scope.mjs` 的 `INTERNAL_EDGES` 逐条冻结）。

### 2.4 被引用面（B10）

**176 处外部引用**（`app/` 71 + `adapters/` 61 + `test/` 35 + 根级 9）的签名必须保持可用。

---

## 3. 已知差异详述（K1–K8）

### K1 本层是「聚合包」而非「强内聚功能包」

**实测**：21 条层内依赖边，**17 个叶子**（不依赖任何层内模块）。
**含义**：模块之间耦合很松，替换时可以逐模块独立进行，不必整体重写。
**风险**：但这意味着**模块边界容易被误判** —— 看起来「独立」的模块可能被 `app/` 大量依赖
（如 `projectIdentity` 仅 7 行却被外部引用 13 处）。

### K2 侦察稿的三处数据错误（已实测更正）

| 项         |                       侦察稿 |                             实测 | 原因                                           |
| :--------- | ---------------------------: | -------------------------------: | :--------------------------------------------- |
| 导出数     |            181（运行时 150） |            **192（运行时 161）** | 漏算 re-export（`export { X } from "./y.js"`） |
| 层内依赖边 |           4 条 / 27 文件独立 |              **21 条 / 17 叶子** | 只扫「层外引用」，漏了层内 import              |
| 层内边方向 | `validation ← imageInput` 等 | **`validation → imageInput`** 等 | 方向反了                                       |

**教训（与 `services-01` K2 同源）**：

> **「grep 找不到」≠「不存在」。** 判断一个模块是否被使用，必须三路检查：
> ① 包外显式 import；② 根桶间接使用；③ **包内层内使用**。
> 侦察脚本只做了 ①，漏了 ③，导致「层内几乎无耦合」的错误印象。

### K3 `staticPng` 与 `referencePath` 不是死代码

**实测**：两者**零外部引用**，但都有层内使用者：

| 模块            |  行 | 使用者                     | 用法                                                                                |
| :-------------- | --: | :------------------------- | :---------------------------------------------------------------------------------- |
| `staticPng`     |  44 | `imageInput.ts:3,91`       | `validateStaticPng(bytes)`                                                          |
| `referencePath` |  83 | `reference.ts:23-33,69,94` | `studioReferencePathReason` / `studioReferencePathDetail` / `StudioReferenceReason` |

**K3 的红线**：**不得因为「零外部引用」而删除这两个模块**（B14 已断言）。

### K4 `referencePath` 与 `reference` 的职责分离是刻意的

- `referencePath` = **纯规则**（路径是否可接受 + 拒绝理由分类），无层内依赖（叶子）；
- `reference` = **完整解析流程**（用纯规则判定 + 产出 verdict）。

`reference.ts:28` 的注释明确写着：

> `路径与身份规则住在 referencePath.ts；这里继续对外暴露同一组符号，调用方无需改动。`

**K4 的红线**：**替换时不得把两者合并** —— 那会让「路径规则」无法单独测试（B15 已断言）。

### K5 本包不含 `contract.ts` 的聚合职责

`services-02` 的 `contract.ts` 用 `export *` 聚合本层的 3 个模块（`imageInput` / `outputRef` / `reference`）。
**那是契约层的入口聚合职责，不在本包范围。**
本包只保证这 3 个模块**自身**的导出面完整（B11）。

### K6 `import type` 的反向引用被接受

`services-02` 的 `workflowTypes.ts` / `kernelTypes.ts` 有 `import type { ... } from "./domain/..."`。
**那是契约层对 domain 的类型引用**（编译期擦除，不构成运行期依赖边）。
本包**接受**这类反向类型引用，**不视为违反 B8**（B12 已断言）。

**⚠️ 但 domain 侧不得反过来**：不能用 `import type` 引入 `app/` 或 `adapters/` 来规避 B8（B12 已断言）。

### K7 桩检测不依赖错误文案

`stub-probe` 用**行为特征**判定是否为桩：

1. **模块导入时直接抛错**（桩在顶层 `throw`）；
2. **有运行时导出但全部为 `undefined`**（桩生成 `export const X: unknown = undefined`）。

**不匹配桩的错误文案**（`not implemented: services-03`）——
依赖文案会把测试耦合到桩生成器上，文案一改检测就失效而测试仍绿。
（这是 `services-02` K7 的同源教训。）

### K8 上游归属：本层在 `upstream-baseline.json` 下零文件

`studio-runtime/` 整个目录在上游基线中不存在（见 `services-02` K8）。
本层 31 个文件在 `licensing/current-files.json` 中分类为 `original 17 / unreviewed 14`；
替换阶段把 `unreviewed` 的 14 个登记为 `independent-replacement` 时，`basis` 需写明实测相似度。

---

## 4. 本包最重要的技术复盘：契约包的静态断言会「门下失效」

### 4.1 现象

**首轮旧门，源码入口 25/25 全绿，但桩替换后仍有 16 个用例通过**（`allFail=false`，判失败）。

### 4.2 根因

契约包的行为面很窄，测试大量依赖**静态分析**：

| 断言类型              | 读取对象             | 桩替换后                |
| :-------------------- | :------------------- | :---------------------- |
| 导出面一致性          | AST 扫**源码文本**   | **文本不变** → 仍通过   |
| `interface.md` 比对   | Markdown 文件        | 不受影响 → 仍通过       |
| 引用面统计            | 源码目录扫描         | 不受影响 → 仍通过       |
| 纯度断言（无 I/O 等） | **桩文件自身的文本** | **桩没有 I/O** → 仍通过 |
| 元数据计数            | `scope-files.json`   | 不受影响 → 仍通过       |

而桩生成器（`build-stubs.mjs`）只做两件事：

```ts
throw new Error("not implemented: services-03"); // ① 模块顶层抛错
export type X = unknown; // ② 按 AST 声明导出名
```

**关键**：② 让**源码文本层面的导出名完全一致** → 所有静态断言照样成立。

**后果**：旧门的 `allFail` 防线退化成「检查文档与源码文本是否一致」，
**而不是「检查实现是否真的可用」**。

### 4.3 修法：运行期守卫 + 行为特征桩检测

**① `tests/load-guard.mjs` 的 `ensureLoadable()`**：

```js
export async function ensureLoadable() {
  if (loaded) return;
  const failures = [];
  for (const row of scope) {
    try { await assertLoadable(row); }          // ← 桩在这里抛 not implemented
    catch (error) { failures.push(...); }
  }
  assert.deepEqual(failures, []);
  loaded = true;
}
```

**每条静态断言开头 `await ensureLoadable()`** → 「先证明模块能真实加载，再比对文本」。

**② `typecheck.test.mjs` 的 `C0` 行为特征桩检测**：
tsc 检查在桩下也会通过（桩是合法 TS）。所以用行为特征判定：
导入即抛 / 运行时导出全为 `undefined`。

### 4.4 收敛过程（每轮都是真实失败，没有放宽任何断言）

| 轮次        |  桩下通过数   | 剩余通过的是哪些                        | 改动                                                                  |
| :---------- | :-----------: | :-------------------------------------- | :-------------------------------------------------------------------- |
| 首次        |  **16 / 25**  | B1/B2/B3/B4/B5/B6/B7/B8/B10/B12 + C1-C4 | （基线）                                                              |
| 第 2 轮     |  **5 / 24**   | C1-C4（typecheck 4 个）                 | 加 `B0` 全模块可加载前置                                              |
| 第 3 轮     |  **4 / 25**   | C1-C4                                   | purity/dependencies/surface 全部接 `ensureLoadable()`；加 `C0` 桩检测 |
| **第 4 轮** | **0 / 25** ✅ | **无**                                  | C1-C4 也接 `ensureLoadable()`                                         |

### 4.5 最终结果

```
源码入口：  tests=25 pass=25 fail=0  exit=0
dist 入口： tests=25 pass=25 fail=0  exit=0
桩替换 31： tests=25 pass=0  fail=25 allFail=true  exit=0
```

### 4.6 与 `services-02` 的对比

| 项           | services-02               | services-03                             |
| :----------- | :------------------------ | :-------------------------------------- |
| 首轮桩下通过 | 22 / 26                   | 16 / 25                                 |
| 收敛轮次     | 4 轮（4→9→20→31）         | 4 轮（16→5→4→0）                        |
| 特殊处理     | `B14` 行为特征桩检测      | `C0` 行为特征桩检测 + purity 断言需前置 |
| **共性**     | 静态断言让 `allFail` 失效 | 同                                      |

**⚠️ 这个陷阱对所有契约包都成立**（`services-04`～`services-08`、`kernel-bridge-03`）。
**建议每个契约包的 `acceptance.md` 都先写「首轮桩下通过数」，再逐轮收敛到 0。**
