# services-04 合同（`packages/services/src` 编排层）

## 这是什么

`packages/services/src` 的**编排层**契约冻结：服务注册基础设施、子 Agent、系统探测、
终端、用量统计、窗口控制 —— **46 个实现文件 / 5,635 行 / 145 导出**。

**与 `services-03` 的本质差异**：本层**允许 I/O**（14 个文件有真 I/O），
所以不变量从「无 I/O」改为「**真 I/O 白名单 + 冻结清单**」。

## 快速开始

```powershell
# 1. 跑契约测试（源码入口）
node --import tsx --test --test-concurrency=1 --test-timeout=600000 `
  specs/contracts/services-04/tests/*.test.mjs

# 2. 跑旧门三段（源码 + dist + 桩替换）
node scripts/contract-gate.mjs --contract "specs/contracts/services-04" --tests "*.test.mjs" `
  --dist-env "KNORVIA_SVC04_ENTRY=dist" `
  --stub-targets "specs/contracts/services-04/stubs/targets.txt" `
  --stub-root "specs/contracts/services-04/stubs" `
  --json "specs/contracts/services-04/gate-old.json"

# 3. 失败类型分类（写回 gate-old.json 的 failureKinds 字段）
node --import tsx specs/contracts/services-04/tests/classify-failures.mjs

# 4. 重新生成（改源码后必须重跑）
node --import tsx specs/contracts/services-04/tests/gen-scope.mjs
node --import tsx specs/contracts/services-04/tests/gen-interface.mjs
node --import tsx specs/contracts/services-04/tests/gen-callers.mjs
node --import tsx specs/contracts/services-04/stubs/build-stubs.mjs
```

## 文件导航

| 文件                       | 用途                                                                                                                                            |
| :------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **`interface.md`**         | 46 个模块的导出签名（**机器生成，886 行**）                                                                                                     |
| **`behavior.md`**          | B0–B10 + C0–C6 行为规格 + 条目 → 测试对照表                                                                                                     |
| **`known-differences.md`** | **K-v**（I/O 分类与副作用）/ **K-w**（惰性入口）/ **K-x**（计划书偏差 1.84 倍）/ **K-y**（第三方垫片）/ **K-z**（转发面完整性，含三次设计纠正） |
| **`acceptance.md`**        | 验收判据 + **首轮桩下通过数 16/35** + **失败类型分类**                                                                                          |
| **`design.md`**            | 替换阶段的分批顺序（按 64 条边拓扑）                                                                                                            |
| **`callers.md`**           | 两种引用口径（直接 18 处 / 经聚合桶 379 文件）                                                                                                  |
| `scope-files.json`         | 46 个文件的冻结快照                                                                                                                             |
| `callers-summary.json`     | 引用统计（测试用）                                                                                                                              |
| `gate-old.json`            | 旧门三段实测 + `failureKinds` 分类                                                                                                              |

## 测试构成（4 套件 / 35 用例）

| 套件           | 用例 | 覆盖                                                                                                             |
| :------------- | :--: | :--------------------------------------------------------------------------------------------------------------- |
| `surface`      |  8   | B0 可加载 · B1 范围×2 · B2 分组 · **B3 导出面逐模块** · **K-z 转发面运行期完整性** · K-z 聚合桶可加载 · K-y 垫片 |
| `purity`       |  10  | **B4a–d 真 I/O 白名单** · **B5a–d 副作用冻结** · B6 无环                                                         |
| `dependencies` |  10  | **B7 层内 64 条边 + 拓扑** · **B8 依赖方向 + 跨组** · **B10 双口径 + 零引用存活 + K-w**                          |
| `typecheck`    |  7   | **C0 桩检测** · C1 聚合桶 · C2–C4 类型检查 · C5 统计 · **C6 导出面交叉校验**                                     |

## ⚠️ 本包最重要的三条教训

### ① 契约包的静态断言会让 `allFail` 失效

首轮桩替换后仍有 **16/35 通过**（因为桩的导出名由 AST 生成，与真实源码文本一致）。
**修法**：`load-guard.mjs` 的 `ensureLoadable()` —— 每条静态断言前先证明模块能真实加载。
**收敛：16 → 0，一轮完成**（`services-02`/`03` 各需 4 轮）。

### ② 「转发面完整性」必须用运行期校验，不能用静态解析

我写错过两次：

- **①** 「被外部引用的模块，其全部导出都应被转发」→ **22 个假孤立**（外部可只引用部分符号）；
- **②** 「静态解析转发语句 + AST 比对」→ **5–7 个假悬空**（`export *` 与多级转发看不穿）；
- **③** 「**加载聚合桶后逐个校验符号存在**」→ **0 缺失** ✅

详见 `known-differences.md` K-z。

### ③ B4/B5 必须先实测再定阈值

```
真 I/O 文件数   猜 17 → 实测 14（6 个只 import 纯工具）
汇聚点数        猜 19 → 实测 18
入度最高        猜 7  → 实测 6（两项并列）
跨组依赖目录    猜 2  → 实测 3（漏 setting）
process.env    猜 1  → 实测 8
```

**「先实测再定阈值」** —— 若按猜的写，合同第一天就红。

## 边界

| 不含                                  | 归属                    |
| :------------------------------------ | :---------------------- |
| `studio-runtime/domain/`（31）        | `services-03`（#267）   |
| `studio-runtime/` 根级（13 + 4 端口） | `services-02`（#265）   |
| `studio-runtime/app/`（45）           | 待定                    |
| `studio-runtime/adapters/`（60）      | 待定                    |
| 两个聚合桶 `index.ts` / `node.ts`     | **不属实现范围**（K-z） |
| `types/yazl.d.ts`                     | 第三方类型垫片（K-y）   |

## 相关

- `specs/knorvia-independent-implementation.md` —— 独立替换总纲
- `specs/contracts/services-02/` —— 契约声明与端口（已合并 #265）
- `specs/contracts/services-03/` —— `studio-runtime/domain` 纯逻辑层（已合并 #267）
