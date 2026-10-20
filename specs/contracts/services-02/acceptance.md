# services-02 验收报告

## 一、交付清单

| 交付项       | 文件                                                                | 状态 | 说明                                               |
| ------------ | ------------------------------------------------------------------- | :--: | -------------------------------------------------- |
| 范围清单     | [`scope-files.json`](scope-files.json)                              |  ✅  | 实测冻结 17 文件 / 1,590 行 / 55,151 字节          |
| 接口冻结     | [`interface.md`](interface.md)                                      |  ✅  | 机器生成，**17 模块 / 164 导出**                   |
| 调用方分析   | [`callers.md`](callers.md) + [`callers-raw.json`](callers-raw.json) |  ✅  | **339 处引用，包外 0**                             |
| 行为规格     | [`behavior.md`](behavior.md)                                        |  ✅  | B1–B16                                             |
| 目标架构     | [`design.md`](design.md)                                            |  ✅  | 分层图 + 端口两段式迁移                            |
| 黑盒测试     | [`tests/`](tests/)                                                  |  ✅  | **4 套件 / 15 子套件 / 31 用例**，双入口 100% 通过 |
| 合同桩与旧门 | [`stubs/`](stubs/) + [`gate-old.json`](gate-old.json)               |  ✅  | 17 个 import-and-throw 桩；**桩替换 31/31 全失败** |
| 验收报告     | 本文件                                                              |  ✅  | —                                                  |
| 已知差异     | [`known-differences.md`](known-differences.md)                      |  ✅  | K1–K7 + 红线清单                                   |

## 二、测试结果

### 2.1 双入口

| 入口                                        | 套件 |  用例  |  通过  | 失败 | 跳过 |
| ------------------------------------------- | :--: | :----: | :----: | :--: | :--: |
| **源码入口**（默认）                        |  15  | **31** | **31** |  0   |  0   |
| **dist 入口**（`KNORVIA_SVC02_ENTRY=dist`） |  15  | **31** | **31** |  0   |  0   |

命令：

```powershell
# 源码
node --import tsx --test --test-concurrency=2 --test-timeout=180000 specs/contracts/services-02/tests/*.test.mjs

# dist（需先 tsc -b 生成 packages/services/dist）
node node_modules/typescript/bin/tsc -b packages/services/tsconfig.json
$env:KNORVIA_SVC02_ENTRY="dist"
node --import tsx --test --test-concurrency=2 --test-timeout=180000 specs/contracts/services-02/tests/*.test.mjs
```

### 2.2 四个测试文件的分工

| 文件                    | 覆盖条目                                                                        | 用例数 |
| ----------------------- | ------------------------------------------------------------------------------- | :----: |
| `surface.test.mjs`      | B1–B6（范围、导出面双向一致、导出总数、纯类型文件零运行时、入口形状、示例定位） |   12   |
| `ports.test.mjs`        | B7–B10、B15（端口签名、下沉路径、零运行期状态、引用面、类型对应）               |   9    |
| `dependencies.test.mjs` | B11–B13、B16（契约层不 import 实现层、层间单向、类型引用闭合）                  |   8    |
| `typecheck.test.mjs`    | B14（契约类型自洽）                                                             |   2    |

## 三、旧门（`gate-old.json`）

```
源码入口：            tests=31 pass=31 fail=0  exit=0
桩替换 17 个目标文件： tests=31 pass=0  fail=31 allFail=true  exit=0
```

命令：

```powershell
node scripts/contract-gate.mjs --contract "specs/contracts/services-02" --tests "*.test.mjs" \
  --stub-targets "specs/contracts/services-02/stubs/targets.txt" \
  --stub-root "specs/contracts/services-02/stubs" \
  --json "specs/contracts/services-02/gate-old.json"
```

### 3.1 遇到的真实问题：契约包的静态断言在桩替换下**假通过**

**这是本包最重要的技术复盘。**

**现象**：首轮旧门源入口 31/31 绿，但桩替换后仍有 **22 个用例通过**（`allFail=false`），旧门判失败。

**根因**：本包是契约包，测试大量依赖**静态分析**——

- AST 抽取导出面（`extractExports` 读源码文本）；
- 解析 `interface.md` 的声明块；
- 读 `callers-raw.json` 的引用计数。

而桩替换只把模块**顶层改成 `throw`**，`export type X = unknown;` 之类的声明仍在文件里。于是：
**「源码文本层面的导出名仍一致」→ 静态断言在桩下照样成立 → 测试对实现没有约束力。**

**为什么这对契约包特别严重**：契约包的行为面本来就窄（没有复杂时序），如果测试全是静态分析，
旧门的「桩替换必须全失败」这条防线就完全失效——它变成了「检查文档与源码文本是否一致」，
而不是「检查实现是否真的可用」。

**修法**（`tests/runtime-guard.mjs`）：给每个静态断言加一道**运行期守卫**：

```js
export async function loadDeclaredExports(row) {
  const loaded = await importModule(row); // ← 桩在这里抛 not implemented
  assert.equal(typeof loaded, "object");
  return { loaded, exports: extractExports(repoRoot, sourcePathOf(row)) };
}
```

于是每条静态断言都变成「**先证明模块能真实加载，再比对文本**」：

- 真实实现 → 导入成功 → 文本比对继续 → 通过；
- 桩 → 导入即抛 → 断言失败 → `allFail` 成立。

**修法后的收敛过程**（每一轮都是真实失败，不是放宽断言）：

| 轮次                                         | 桩下失败 / 总 | 剩余通过的是哪些                  |
| -------------------------------------------- | :-----------: | --------------------------------- |
| 首次                                         |    4 / 26     | 22 个纯静态断言                   |
| 加守卫后                                     |    9 / 31     | 12 个元数据断言（计数、路径记录） |
| 第二轮守卫（元数据断言也接入）               |    20 / 31    | 11 个                             |
| 第三轮（B14 加「示例导出非 undefined」检查） |  **31 / 31**  | **0**                             |

**`B14` 的特殊处理**：`contract.example.ts` 的 tsc 检查在桩下也通过（因为桩是合法的 TS 类型声明）。
所以额外断言「示例的每个运行时导出都不是 `undefined`」且「文件不含 `not implemented: services-02`」——
桩文件顶层 `throw` 时导入就失败，导出也全是 `undefined`，这两条都会红。

**结论**：契约包**不能只靠静态断言**。这是本包给后续契约包的通用经验（`known-differences.md` K4 之外的补充）。

## 四、端口下沉

| 项           | 值                                                                                  |
| ------------ | ----------------------------------------------------------------------------------- |
| 沉浮文件     | 4（`ports`、`storePort`、`imagePort`、`workspaceRuntimePort`）                      |
| 影响引用     | **94 处**，全部在 `packages/services/` 内（`services/src` 61 + `services/test` 33） |
| 包外引用     | **0**                                                                               |
| 接口签名改动 | **0**                                                                               |
| 替换策略     | 两段式：先移实现 + 旧路径留 re-export 壳；再按包逐步改引用                          |

## 五、数据与数字的自我更正记录

合同撰写过程中发现并更正了两个数字，如实记录：

| 先前说法                               | 实测                                                                                                                    | 更正来源                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `contract.example.ts` 「零引用」       | **1 处**：`packages/services/test/studio-review-attention-integration.test.ts:12` 导入 `confirmPreparedWorkspaceReview` | `callers.md` 扫描发现，已按实测改写并调整定性（测试夹具，非死代码）                                  |
| 导出 164 项中「运行时 72 / 纯类型 92」 | **运行时 50 / 纯类型 114**                                                                                              | 先前从 `interface.md` 逐行手数出错；现按 `extractExports` 实测冻结到 `scope.mjs` 的 `FROZEN.exports` |

## 六、未覆盖与已知边界

1. **`contract.ts` 是聚合桶**：它 `export *` 了 3 个 `domain/` 模块。这**不是契约层的依赖边**，而是入口聚合职责；
   契约层的独立性由 13 个文件（9 声明 + 4 端口）保证。详见 `known-differences.md` K4。
2. **3 个 `domain/` 模块不纳入本包**：`imageInput`(126) + `outputRef`(279) + `reference`(340) = 799 行、
   30 个导出函数，**含实质运行时逻辑**，不能移入契约层；归 `services-03`。
3. **`module.ts` 零内部引用**：6 行模块描述符，无 import 使用者；本轮不删（需先确认 `package.json` exports 不指向它）。
4. **dist 入口需先构建**：`packages/services` 无独立 `build` 脚本，dist 由 `tsc -b packages/services/tsconfig.json` 生成。
5. **`import type` 不算依赖边**：`kernelTypes.ts:1`、`workflowTypes.ts:2` 各有 1 处 `import type` 指向实现层，
   编译期被完全擦除，不违反 B11。详见 `known-differences.md` K6。

## 七、下一步

1. 本合同的 PR（`contract: services-02 v1（studio-runtime 契约层）`）；
2. 合同批准后进入**替换阶段**：按 `design.md` 的分工实现 17 个文件；
3. 替换阶段必须让本合同的 31 个用例双入口通过 + 两道相似度门槛 + `licensing` 登记。
