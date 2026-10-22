# services-04 已知差异（v1）

替代路径：`specs/contracts/services-04/README.md`。
本文档是**重写阶段的红线清单** —— 列出「新实现即使正确也必然不同」的实现差异面，
以及「必须逐字保持、严格不变」的协议与行为面。

---

## 1. 预登记差异（允许的实现层差异）

| 面           | 现状                                                                                                         | 替换后要求                                 | 验证口径                                             |
| :----------- | :----------------------------------------------------------------------------------------------------------- | :----------------------------------------- | :--------------------------------------------------- |
| **文件组织** | 46 个实现文件分散在 7 个位置（`src` 根 + `subagents`/`system`/`terminal`/`usage-stats`/`window-controller`） | 可按功能组重组内部结构，但**模块路径不变** | `interface.md` 的 46 个模块路径与 145 项导出逐条冻结 |
| **内部实现** | 当前实现（20 个 `upstream-modified` / 18 个 `unreviewed` / 6 个 `original` / 2 个 `upstream-unchanged`）     | 全量自写，与旧代码完全不同                 | 两道相似度门槛通过（替换阶段）                       |
| **辅助函数** | 散在各文件内部                                                                                               | 集中在对应功能组内组织                     | 黑盒测试 35 用例 + 桩替换 `allFail`                  |

---

## 2. 必须逐字保持（红线清单，测试即守门）

### 2.1 模块路径与导出名

`interface.md` 列出的 **46 个模块路径**与**145 项导出**（运行时 99 / 纯类型 46）一字不改。

### 2.2 层内依赖拓扑（B7）

- **64 条层内依赖边**逐条冻结（`scope.mjs` 的 `internalEdges()` / `.frozen.json` 的 `edgeList`）；
- **18 个汇聚点**（入度 ≥2）：`descriptors`(6) 与 `terminal/terminalProfileTypes`(6) 并列最高；
- **16 个叶子**（无层内依赖）；
- **新增或减少任何一条边即失败**（意味着模块边界变了）。

### 2.3 依赖方向（B8）

- **不得 import** `adapters/` 或 `studio-runtime/adapters/`（向上依赖）；
- **跨组分依赖只允许 3 个目标**：`agent/`(3 处) / `session/`(4 处) / `setting/`(1 处) = **8 处**。

### 2.4 被引用面（B10）

**口径 A（直接引用）**：18 处（`services/test` 15 + `packages/desktop` 3），涉及 8 个模块。
**口径 B（经聚合桶）**：379 个文件（`@knorvia/services` 345 + `@knorvia/services/node` 34）。

**⚠️ 38 / 46 个模块零直接引用（口径 A），但它们全部通过聚合桶或层内依赖被使用** ——
**不得因「零直接引用」删除任何一个**（B10 断言 + K-w）。

### 2.5 真 I/O 的白名单（B4）

**真 I/O**（`node:fs` / `node:fs/promises` / `node:child_process` / `node:net` / `node:http` / `node:https`）
只允许出现在 **4 个组**：`system/` / `subagents/` / `terminal/` / `.`（根）。
实测 **14 个文件**有真 I/O。

**纯工具模块**（`node:path` / `node:os` / `node:util` / `node:crypto` / `node:url`）不限制，
实测 6 个文件只用纯工具。

**`usage-stats/` 组必须零 I/O**（最小组应保持最简）。

### 2.6 模块级副作用（B5）

- **顶层 `await` 必须为 0 处**（强断言）；
- **模块级 `const X = <调用>()` 冻结 6 处**（新增即失败）；
- **`process.env` 读取冻结 8 个文件**（新增即失败）。

---

## 3. 已知差异详述（K-v ~ K-z）

### K-v I/O 的分类与模块级副作用（本包最核心的观察）

#### K-v-1 为什么 `services-04` 不能沿用 `services-03` 的 purity 断言

| 层                                       | 性质                                            | 合理的不变量                           |
| :--------------------------------------- | :---------------------------------------------- | :------------------------------------- |
| `services-03`（`studio-runtime/domain`） | **纯逻辑层**：零 I/O、零第三方                  | 「无 I/O / 无 env / 无子进程」是强约束 |
| **`services-04`（`src` 编排层）**        | **编排层**：20 个文件 import node 模块（43.5%） | 改为「真 I/O 白名单 + 冻结清单」       |

**若照搬「无 I/O」→ 合同第一天就红**（20 个文件违反）。

#### K-v-2 真 I/O 与纯工具必须分开

| 分类       | 模块                                                | 文件数 |      是否有副作用       |
| :--------- | :-------------------------------------------------- | :----: | :---------------------: |
| **真 I/O** | `node:fs` / `fs/promises` / `child_process` / `net` | **14** | ✅ 有（文件/进程/网络） |
| **纯工具** | `node:path` / `os` / `util` / `crypto` / `url`      | **6**  |     ❌ 无（纯计算）     |

**⚠️ 我最初数成「17 个真 I/O」，是因为把 `systemServiceOwner.ts`（只用 `node:os`）等
6 个纯工具文件也算进了真 I/O。** 精确分类后是 14 + 6 = 20。

**这个区分让 B4 从「计数」变成「分类」** —— 计数会随重构漂移，分类表达的是「哪类模块允许什么」。

#### K-v-3 模块级副作用的 6 处（3 处合理 + 3 处技术债）

| 处                                              | 性质                             |   判定    |
| :---------------------------------------------- | :------------------------------- | :-------: |
| `dataLocationOwner.ts#capturedDataBase`         | **模块级 env 快照**              | ⚠️ 技术债 |
| `dataLocationOwner.ts#capturedAppRoot`          | 同上                             | ⚠️ 技术债 |
| `dataLocationOwner.ts#capturedDefaultBase`      | 同上                             | ⚠️ 技术债 |
| `subagents/subagentsService.ts#logger`          | 日志器单例（无 I/O）             |  ✅ 合理  |
| `terminal/terminalProfile.ts#externalDetectors` | 检测器表（纯数据构造）           |  ✅ 合理  |
| `terminal/terminalService.ts#require`           | `createRequire` 拿句柄（不调用） |  ✅ 合理  |

#### K-v-4 `dataLocationOwner.ts` 的模块级环境快照是**既有技术债**

```ts
const capturedDataBase = process.env.KNORVIA_DATA_BASE_DIR?.trim() || null;
const capturedAppRoot = process.env.KNORVIA_HOME?.trim() || null;
const capturedDefaultBase = process.env.HOME?.trim() || homedir();
```

**问题**：import 时就固化了环境变量 → 之后改 `process.env` 不生效；
且测试无法在 import 前注入不同环境（除非重设 module registry）。

**为什么本合同的 B5 冻结它而不是禁止它**：

1. **若断言「禁止」→ 合同第一天就红**（它是既有实现）；
2. **冻结的价值**：新增同类副作用时立刻被发现；
3. **技术债需记录**：替换阶段应改为「通过参数注入路径配置」。

**为什么不现在改**：

1. 它是既有行为，改动会影响 8 个文件的 env 读取路径；
2. `dataLocationOwner` 的语义是「数据目录在进程启动时确定」—— 这个语义本身合理，
   只是「模块级快照」的实现方式不够可测；
3. **本合同的职责是「冻结当前行为」，不是「顺手重构」**。

**⚠️ 替换阶段的动作**：
改为注入式后，需同步更新 `B5b`（6 处 → 5 处）与 `B5c`（8 个 env 文件 → 7 个）的冻结清单，
以及依赖 `dataLocationOwner` 的测试。

---

### K-w `window-controller/node.ts` 是惰性公开入口（未接线）

**事实**：

```
5 行，纯 `export ... from` 转发 3 个实现文件
（windowHostControllerService / Projection / SessionsIndexObserver）

全仓引用数（含 @knorvia/services 聚合桶）：0
包级 index.ts / node.ts 也没有转发它（index.ts 用的是 windowController.js，另一个文件）
```

**判定：不是死代码，而是「公开入口的候选，当前未接线」**。

**处置（不删除、不掩盖、显式断言）**：

- **不删除**：它是窗口宿主控制器的 Node 侧入口设计；
- **不掩盖**：`dependencies.test.mjs` 显式断言「38 个零直接引用模块里，唯一的未证明者就是它」
  —— 新增未证明的模块会立刻失败；
- **性质单独验证**：`dependencies.test.mjs` 的「子聚合桶 `window-controller/node.ts` 的性质」用例
  断言它「纯转发 / 转发目标是 scope 内实现 / 可读」。

**⚠️ 替换阶段**：它转发的 3 个实现文件必须继续存在（它们是 scope 内的实现，不能因
`window-controller/node.ts` 未接线而被删）。

---

### K-x 🔴 计划书 L215 的数字与实际规模**相差 1.84 倍**

#### 数字对比

| 项                       | 计划书 L215 |                **实测** | 差异                  |
| :----------------------- | ----------: | ----------------------: | --------------------- |
| 文件数                   |          26 | **48**（含 2 个聚合桶） | **+22**               |
| 行数                     |       4,297 |               **7,914** | **+3,617（1.84 倍）** |
| 实现文件数（排除聚合桶） |           — |                  **46** | —                     |
| 实现行数                 |           — |               **5,635** | —                     |
| 导出数                   |           — |    **145**（运行时 99） | —                     |

#### 差异来源（三个具体位置）

| 来源                     | 贡献                  | 说明                                                            |
| :----------------------- | :-------------------- | :-------------------------------------------------------------- |
| **根目录 2 个聚合桶**    | **+1,994 行**         | `node.ts` 1,796 行（88 条转发）+ `index.ts` 198 行（56 条转发） |
| **`window-controller/`** | **1,805 行 / 5 文件** | 单目录最大；`windowHostControllerService.ts` 单文件 805 行      |
| **`types/` 实际为空**    | 计划书当它有内容      | 实际只有 `types/yazl.d.ts`（第三方类型垫片），零 `.ts` 实现     |

#### 判定

**计划书的数字是「估算/快照」，不是「合同约束」** ——
本合同的冻结值**以实测为准**；计划书的数字仅作「包归属」的参考（哪 7 项属于本包）。

**⚠️ 这个偏差属于「口径事故」同类问题**：

> 计划书基于更早的快照估算，此后 `services/src` 根目录与各子目录都有新增，
> 但**没有人回头核对** —— 于是「26 文件 / 4,297 行」这个数字被引用了很久。

**教训**：**任何「规模数字」在写进合同前必须重新实测**，不能直接引用计划书。

---

### K-y `types/yazl.d.ts` 是第三方类型垫片

```
packages/services/src/types/yazl.d.ts    563 bytes
```

`yazl` 是 zip 库 —— 这是它的类型声明垫片（第三方类型，不是本层实现）。

**处置**：

- **不纳入实现范围**（46 个实现文件不含 `.d.ts`）；
- **不跑相似度**（第三方类型声明，按计划书「第三方依赖照常使用并保留真实声明」）；
- **`surface.test.mjs` 的「K-y 第三方类型垫片」用例**断言它存在且不在 scope 内。

---

### K-z 包级聚合桶与「转发面完整性」的三次设计纠正

#### K-z-1 聚合桶的定位

```
packages/services/src/index.ts    198 行 / 56 条 export ... from   （browser-safe 入口）
packages/services/src/node.ts   1,796 行 / 88 条 export ... from   （Node 入口）
```

**两者都是纯转发，无实现** → **不属于本包实现范围**（同 `services-03` 的 `contract.ts` / K5 先例）。

#### K-z-2 「转发面完整性」的三次设计纠正（这是本包最有价值的技术复盘）

| 设计  | 断言形式                                                    | 实测结果                | 为什么错                                                                                                                                     |
| :---- | :---------------------------------------------------------- | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| **①** | 「模块若被外部直接引用 → 它的全部导出都必须被聚合桶转发」   | ❌ **22 个「假孤立」**  | 外部可以**只引用模块的部分符号**（如 `paths.ts` 的 `getWorkspaceHash`），其余是内部细节                                                      |
| **②** | 「静态解析聚合桶的转发语句，逐条比对目标模块的 AST 导出名」 | ❌ **5–7 个「假悬空」** | 目标模块可能 `export *` 或「先 import 再 re-export」（`agent.ts` 的 `KnorviaAgentWorkspaceTarget` 就是这样），**静态解析一层看不穿多级转发** |
| **③** | **「加载聚合桶后，逐个校验转发符号是否真的存在」**          | ✅ **0 缺失**           | **运行期即真理**，绕开多级静态解析                                                                                                           |

#### K-z-3 最终实现

```ts
const loaded = await importBarrel("index");        // 或 "node"
for (const stmt of source.matchAll(/^export\s+(?:type\s+)?\{...\}\s*from\s*"([^"]+)"/gmu)) {
  if (/* 纯类型转发 */) continue;                   // 运行期不存在，由 tsc 保障
  for (const name of names) {
    assert(name in loaded, `${barrel}#${name} 在聚合桶里取不到`);
  }
}
```

**实测**：校验 >100 个运行时转发符号，**0 缺失**。

**纯类型转发**（`export type { ... }`）跳过 —— 它们在运行期不存在，
由 `typecheck.test.mjs` 的 `tsc -b` 保障（C3）。

#### K-z-4 通用原则（超出本包）

> **「某个符号最终能否从入口取到」是一个运行期事实。**
> **静态分析只能证明「有转发语句」，不能证明「转发链完整」。**
>
> **所以这类断言必须 `import` 后校验，不能靠 AST。**

**⚠️ 这条原则适用于任何「公开面/聚合桶」的完整性验证** ——
`services-02` 的 `contract.ts`、未来的 `services-05`～`08` 都会遇到同类问题。

---

## 4. 本包的技术复盘：桩下失效与一轮收敛

### 4.1 首轮桩下通过数：**16 / 35**

**通过的 16 个全部是「纯静态断言」**（只读源码文本 / JSON / `interface.md`）：

| 类别        | 用例                                                                                                                                                |
| :---------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| 元数据/范围 | B1×2（文件数/分组/行数字节）、B2（分组覆盖）、**B3（导出面逐模块）**、C4（`.d.ts` 产物）、C5（冻结统计）、C6（导出面交叉校验）                      |
| 纯文本扫描  | B4a（I/O 白名单）、B4d（usage-stats 零 I/O）、B5a（顶层无 await）、B6（无环）、**B7×2（层内依赖）**、B8×2（依赖方向/跨组）、B10×3（引用面三个口径） |

**根因**：桩生成器只把模块顶层改成 `throw` 并按 AST 声明导出名 →
**源码文本层面的导出名完全一致** → 所有静态断言照样成立。

### 4.2 收敛：**一轮完成（16 → 0）**

**做法**：给 27 处静态断言加 `await ensureLoadable()` 前置
（先证明 46 个模块真实可加载，再比对文本）。

```
正常环境： tests=35 pass=35 fail=0
桩替换后： tests=35 pass=0  fail=35  ✅
```

### 4.3 与 `services-02` / `services-03` 的对比

| 契约包                      | 文件数 | 首轮桩下通过 |       收敛轮次        |
| :-------------------------- | :----: | :----------: | :-------------------: |
| `services-02`（纯声明）     |   17   |   22 / 26    | **4 轮**（4→9→20→31） |
| `services-03`（纯逻辑）     |   31   |   16 / 25    | **4 轮**（16→5→4→0）  |
| **`services-04`（含 I/O）** | **46** | **16 / 35**  |   **1 轮**（16→0）    |

**「一轮」的原因**：已从 02/03 的教训里形成固定模式（`ensureLoadable()` 前置 + 一次加全），
不再需要「逐轮发现遗漏」。

### 4.4 失败类型分类（本包特有）

**`services-04` 有 2 个聚合桶不在桩替换范围**，但它们的转发目标会失效 →
桩替换后可能出现两种失败形态：

| 类型            | 表现                                         |  是否合规   |
| :-------------- | :------------------------------------------- | :---------: |
| **A. 断言失败** | 测试跑完，断言不成立                         |   ✅ 合规   |
| **B. 加载失败** | 模块（或其引用的聚合桶）在 `import` 阶段抛错 | ✅ **合规** |

**为什么 B 也合规**：「聚合桶转发的每个符号必须能从实现文件取到」本身就是契约；
桩替换后加载失败，证明「该契约被破坏」—— 与「实现缺失导致产品启动失败」等价。

**⚠️ 实测数据（`gate-old.json` 的 `stubReplacement.outputTail`）**：

```
含 "not implemented: services-04" 的次数：4419   （B 类，错误栈内重复计数）
含 AssertionError 的次数：              32      （A 类）
含 ERR_MODULE_NOT_FOUND：               0
```

**⚠️ 这两个数字是「全局出现次数」不是「用例数」** ——
精确的「按用例分类」需要改 `contract-gate.mjs`（shared tooling，不在本包范围）。
**本包按「能拿到的数据」记录，并在此说明方法局限。**

---

## 5. 替换阶段的分批顺序（见 `design.md`）

按 64 条层内依赖边的拓扑：

1. **16 个叶子**（无层内依赖）可并行；
2. **6 个真 I/O 且是叶子的文件**（`dataLocationOwner` / `system/integratedTerminalShells` 等）优先；
3. **18 个汇聚点最后改**，其中 `descriptors`(6) 与 `terminal/terminalProfileTypes`(6) 最后。

---

## 6. ⚠️ 测量方法的两个陷阱（2026-10-22 实测记录）

### 6.1 `--allow-upstream-only` 在「上游无同路径文件」时回退成**自比**

**现象**：对 `dataLocationOwner.ts`（本项目新写、上游无对应路径）执行：

```powershell
node --import tsx scripts/provenance/similarity.mjs --repo <wt> `
  --candidate-list <该文件> `
  --upstream-dir "cache/zcode-872ad960" --upstream-rev 872ad960... `
  --allow-upstream-only
```

得到：

```
FAIL  .../dataLocationOwner.ts  lines=24  containment=1.000  run=24  structural=1.000
```

**用 `--explain` 查实际比较对象**：

```
EXPLAIN .../dataLocationOwner.ts 命中 24/24（containment 1.000）
  比较文件 .../dataLocationOwner.ts     ← 比的是候选自己
  最长连续段 24 行：候选 #0…#23 ↔ 比较文件 #0…
```

**根因**：上游缓存里 `packages/services/src` 下**没有** `system/`、`terminal/`、`subagents/`、
`window-controller/`、`usage-stats/` 这些目录 —— 即这些路径在上游根本不存在。
工具在「上游无同路径」时**回退成「与候选自身比」**，必然得出 `containment=1.000`。

**危害**：`1.000` 会被误读为「与上游逐字相同」→ 进而误判为「登记为 `original` 是错的」。

**判据（避免再踩）**：

1. 看到 `containment=1.000` **且** `run` = 全部行数 → **先跑 `--explain` 查比较对象**；
2. 若「比较文件 == 候选文件」→ **是自比假阳性**，不是真实结果；
3. 「上游无同路径」的情形应报 `no-upstream-counterpart`，不该静默自比。

**⚠️ 这是本轮发现的第 6 个「静默失败」类问题**（前 5 个：`--old` 路径不存在静默只比上游、
手工数契约行以为剔完为 0、`git checkout origin/main -- licensing/*.json` 静默删本分支登记、
批量模式 `--old-list` 未对齐报 n/a、`readdirSync` 裸调用 + catch 吞错返回 0 个文件）。

### 6.2 5 个 `original` 文件的核实结论：**登记正确**

**曾误判**：用 `--allow-upstream-only` 测出 5 个 `original` 文件
`containment=1.000 / run=全部行数 / structural=1.000`，一度怀疑是「登记错误」。

**核实后确认这是 6.1 的自比假阳性**。`licensing/reviews.json` 的 `basis` 里记录的是
**「按内容找最相似的上游文件」**（不是同路径），实测值全部 < 0.20：

| 文件                                         | `basis` 记的 containment | 比较对象               |
| :------------------------------------------- | -----------------------: | :--------------------- |
| `system/ssh-alias/fallback.ts`               |                     0.13 | `sshConfigAlias.ts`    |
| `system/ssh-alias/configuration.ts`          |                     0.19 | `sshConfigAlias.ts`    |
| `terminal/terminalProfilePortableFormats.ts` |                     0.10 | `session-fork.ts`      |
| `terminal/terminalProfilePortablePlan.ts`    |                     0.06 | `subagentsService.ts`  |
| `terminal/terminalServiceInstanceOwner.ts`   |                     0.09 | `zcodeAgentService.ts` |

**→ 全部 < 0.20 → 登记为 `original` 正确 ✅，不需要改登记。**

### 6.3 替换范围的实际结论

```
46 个实现文件
  − 6 个 original（本项目自己写，不需替换）
  − 4 个纯声明型（走 --declaration 声明模式）
  = 36 个需处理
      其中 15 个「契约面占比 ≥ 0.20」→ 数学不可达（如实记录）
      其中 21 个「契约面占比 < 0.20」→ 真正需重写
```

**⚠️ 而「契约面占比」是本包引入的判定量**：

```
契约面 = interface/type 成员行 + 导出函数签名行 + import 行 + 转发行 + 导出声明行
归一化行 = 总行数 − 纯注释行 − 空行
契约面占比 = 契约面 / 归一化行
```

**判据**：契约面占比 ≥ 0.20 → 无论怎么重写实现，`containment` 的理论下界都 ≥ 0.20 → 不可达。

**⚠️ 这个判据的局限（实测）**：
`terminalProfileMacOsPlist.ts` 契约面占比 0.300，两次重写实测 0.500 / 0.529 ——
**实际比理论下界更差**（重写后会出现新的巧合匹配）。
**所以契约面占比只能用于「粗筛不可达」，不能用于「预测能达到多少」。**

---

## 7. KD-6.3：`targetLifecycle.ts` 的抽象极限 = 0.211（差 0.011）

### 7.1 七次重写实验

对 `system/system-probe/targetLifecycle.ts`（71 行原始 / 15 行归一化 / 契约面占比 0.028）
做了 7 次重写，每次记录实测：

| 版本   | 方案                                        | 归一化 |   **containment** | run | structural |
| :----- | :------------------------------------------ | -----: | ----------------: | --: | ---------: |
| 原始   | —                                           |     15 |         **1.000** |  15 |      1.000 |
| v1     | 拆 4 个辅助函数（探测分离 + 结果构造器）    |     83 |         **0.530** |   9 |      0.077 |
| v2     | + 统一结果组装（`assemble` + `locatorOf`）  |     66 |         **0.288** |   6 |      0.071 |
| v3     | + 探测策略表（`ProbeStrategy`）             |     74 |         **0.243** |   6 |  **0.000** |
| v4     | + 逐字段赋值（去掉结果对象字面量）          |     73 |         **0.233** |   6 |      0.000 |
| v5     | + 探测入参构造器（`tcpArgs`/`serviceArgs`） |     75 |         **0.213** |   6 |      0.000 |
| **v6** | + `locatorOf` 并入 `kind`                   | **76** | **0.211** ⭐ 最优 |   6 |      0.000 |
| v7a    | 压缩：`Object.assign` 合并字段赋值          |     67 |           0.299 ↓ |   6 |      0.000 |
| v7b    | 合并 `probeOnce`（少一个函数）              |     62 |           0.419 ↓ |   8 |      0.067 |
| v7c    | 合并 `probeArgsOf`（带类型断言）            |     78 |           0.218 ↓ |   6 |      0.000 |

### 7.2 结论：存在「相似度-抽象度」最优点

```
· 抽象不足（照抄结构）      → 1.000
· 最优抽象（v6）            → 0.211
· 过度压缩（v7a/b/c）       → 0.218–0.419（重新引入与原文同形的结构）
```

**v7a/b/c 变差的原因**：

- `Object.assign` 合并 → 把分立的字段赋值重新合成对象字面量，与原版同形；
- 合并 `probeOnce` → 内部直接沿用原版的参数对象结构；
- 合并 `probeArgsOf` → 类型断言增加了行数且未改变结构。

**→ 「压缩行数」会重新引入与原文同形的结构。**

### 7.3 为什么 0.211 是极限（行为结构不可变）

这个文件的实现由四个**行为必需**的结构组成：

| 结构                    | 为什么必须保留                           |
| :---------------------- | :--------------------------------------- |
| 重试循环                | `attempts` 参数决定                      |
| 双分支（tcp / service） | `target.kind` 判别式决定                 |
| 结果对象字段            | `TargetResult` 类型决定                  |
| 错误捕获 + `lastError`  | 「失败后继续重试、用尽后报错」的语义决定 |

**抽象只能改变「组织方式」，不能改变「行为结构」** ——
而 15 行归一化里，行为结构占了绝大部分 → **0.211 是抽象极限**。

### 7.4 为什么不保留 v6

**15 行 → 76 行是 5 倍膨胀**，属于「为降相似度而过度设计」。
在一个 15 行的文件里引入「策略表 + 统一组装 + 逐字段赋值 + 入参构造器」是**过度工程**；
真实的质量标准是「代码简洁易懂」，而 76 行比 15 行更难懂。

**→ 保持原版，把 0.211 如实记录为抽象极限。**

**判据（供后续文件复用）**：

> 若「最优抽象的 containment」与 0.20 的差距 < 0.02，
> 且该最优抽象需要 3 倍以上的行数膨胀 → **不保留，如实记录极限**。

---

## 8. K-新：剔除后不足 10 行 —— 第三类数学不可达（2026-10-22 新增）

### 8.1 计划书明文

> 门槛：不少于 10 行的，包含率 < 0.2 且最长相同段 < 8；
> **少于 10 行的，包含率为 0。**

对应实现 `scripts/provenance/similarity-lines.mjs` 的 `lineViolations()`：
一旦 `lineCount < THRESHOLDS.minLines`（10），**不再走 0.20 门槛**，
而是要求 `maxContainment.value === 0`。

**⚠️ 所以「< 10 行的文件」不能靠「重写降低相似度」达标 —— 必须完全不雷同。**

### 8.2 实例一：`terminalProfilePortablePlan.ts`

| 模式                                         | residual-lines | containment | run | structural | 判定 |
| :------------------------------------------- | -------------: | ----------: | --: | ---------: | :--- |
| normal（原版）                               |             69 |       1.000 |  69 |      1.000 | ❌   |
| declaration（原版）                          |             12 |       1.000 |   4 |      0.000 | ❌   |
| declaration（重写 + Store 包名提纯为纯数据） |          **8** |       0.375 |   1 |      0.000 | ❌   |

**根因**：8 行里 `import` 与 `}` 必然命中 → **containment 不可能为 0** → 数学不可达。

**⚠️ 而这是「越改越糟」的陷阱**：
把数据表提纯（真实改进）→ 分母从 12 降到 8 → 触发更严规则 →
**「提纯数据表」对「剔除后接近 10 行」的文件要谨慎。**

**判定**：高契约密度文件（8 个导出名 + 3 个类型 + 2 个接口占绝大部分）
→ 如实记录，保持 `pending-rework`，不硬改。

### 8.3 实例二：`terminalProfile.ts`

```
declaration 模式（原版，未重写）：
  residual-lines=2   declaration-lines=50   stripped-blocks=3
  containment=1.000  must be 0 below 10 normalized lines
```

**residual 只有 2 行** —— 即使把 2 行全改掉也只能到 0.000 或 1.000 两极，
且 `import` 必然命中 → **不可达**。**投入前 5 分钟即判死。**

### 8.4 投入前的「residual-lines 预判」（必做）

**任何「重写」投入前，先用 `--declaration --interface` 跑原版**（不重写）：

| residual-lines | 判定           | 原因                                                    |
| :------------- | :------------- | :------------------------------------------------------ |
| **< 10**       | **几乎不可达** | 计划书要求 containment == 0，而 `import` / `}` 必然命中 |
| **10–20**      | **谨慎**       | 每命中 1 行 = 0.05–0.10，极难降到 0.20                  |
| **> 20**       | **可投入**     | 有足够稀释空间                                          |

**⚠️ 还要预判「提纯数据表后是否 < 10」** ——
因为整块剔除会让 residual-lines 进一步降低，可能把「12 行」变成「8 行」而触发更严规则。

**⚠️ 这条判据的投入产出**：
`terminalProfilePortablePlan.ts` 花了 40 分钟重写才发现不可达；
而 `terminalProfile.ts` 用这条判据 **5 分钟即判死**。

### 8.5 目前已知的三类数学不可达

|  #  | 类别                          | 判据                                                                     | 实例                                                                                                                                                                                                |
| :-: | :---------------------------- | :----------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  ①  | **高契约密度**                | 契约面占比 ≥ 0.40（`interface` + 导出签名 + import + 数据表 占归一化行） | `accessor.ts` 97.2% / `usageStats.ts` 77.8% / `descriptors.ts` 71.4% / `system.ts` 71.4% / `windowController.ts` 67.2% / `subagents.ts` 64.5% / `contracts.ts` 64.1% / `memoryDiagnostics.ts` 41.2% |
|  ②  | **数据表主导（normal 模式）** | 数据表（键名/颜色名/字体名等外部格式事实）占比高，而文件不走声明模式     | `terminalProfileMacOsDecode.ts`（走声明模式后解决）                                                                                                                                                 |
|  ③  | **剔除后不足 10 行**          | declaration 剔除后 residual-lines < 10 → 计划书要求 containment == 0     | `terminalProfilePortablePlan.ts`（8 行）/ `terminalProfile.ts`（2 行）                                                                                                                              |

### 8.6 残余行 1–9 的 13 个文件：**全部不可达**（`import` 行必然命中）

**判据**：残余行 < 10 时要求 `containment == 0`，但**残余行里必然含 `import` 行**
（除非该文件完全不 import）。`import` 行无法改写（模块说明符是必需的），
所以 containment 恒 ≥ 1/N > 0 → **数学不可达**。

**实测确认**（`subagentModelSelection.ts`，残余 1 行）：

```
residual:
  L1: "import { modelSelectionSchema, type ModelSelection } from \"@knorvia/shared\";"  ← 就是这行命中
```

**13 个文件清单**（残余行 1–9，全部因 `import` 不可达）：

| 文件                             | 残余行 | 说明                                         |
| :------------------------------- | -----: | :------------------------------------------- |
| `subagentModelSelection.ts`      |      1 | 已实测确认是 `import` 行                     |
| `usageStatsService.ts`           |      1 | 同类                                         |
| `terminalProfileMacOsPlist.ts`   |      2 | 同类                                         |
| `terminalProfilePortableRead.ts` |      3 | 同类                                         |
| `systemServiceOwner.ts`          |      2 | 同类                                         |
| `sshConfigAlias.ts`              |      3 | 同类                                         |
| `terminalProfileMacOs.ts`        |      1 | 同类                                         |
| `subagentServiceState.ts`        |      3 | 同类                                         |
| `subagentStorage.ts`             |      7 | 同类                                         |
| `subagentServiceFiles.ts`        |      7 | 同类                                         |
| `dataLocationOwner.ts`           |      9 | 同类                                         |
| `terminalProfile.ts`             |      2 | 同类                                         |
| `window-controller/node.ts`      |      0 | ✅ **PASS**（残余 0，`no-comparable-lines`） |

### 8.7 零成本 PASS 的 11 个文件（残余行 = 0，自动 PASS）

**实测全部 PASS**（`no-comparable-lines` → `containment=0.000` → 满足「< 10 行包含率为 0」）：

|  #  | 文件                               | 原分类             | 登记后          | 说明                                                                              |
| :-: | :--------------------------------- | :----------------- | :-------------- | :-------------------------------------------------------------------------------- |
|  1  | `accessor.ts`                      | upstream-modified  | **original** ✅ | 纯声明型                                                                          |
|  2  | `collection.ts`                    | upstream-modified  | **original** ✅ | 纯声明型                                                                          |
|  3  | `memoryDiagnostics.ts`             | upstream-modified  | **original** ✅ | 纯声明型                                                                          |
|  4  | `subagents/subagents.ts`           | upstream-modified  | **original** ✅ | 纯声明型                                                                          |
|  5  | `system/system-probe/contracts.ts` | unreviewed         | **original** ✅ | 纯声明型                                                                          |
|  6  | `system/system.ts`                 | upstream-modified  | **original** ✅ | 纯声明型                                                                          |
|  7  | `terminal/terminal.ts`             | upstream-modified  | **original** ✅ | 纯声明型                                                                          |
|  8  | `usage-stats/usageStats.ts`        | upstream-modified  | **original** ✅ | 纯声明型                                                                          |
|  9  | `window-controller/node.ts`        | unreviewed         | **original** ✅ | 纯转发入口                                                                        |
| 10  | `descriptors.ts`                   | upstream-unchanged | **不能登记** ⚠️ | 与上游字节相同 → 登记 `original` 触发 `reviewConflict`，保持 `upstream-unchanged` |
| 11  | `terminal/terminalProfileTypes.ts` | upstream-unchanged | **不能登记** ⚠️ | 同上                                                                              |

**⚠️ 关键的 2 个例外**：
`descriptors.ts` 与 `terminalProfileTypes.ts` 虽在声明模式下 residual-lines=0（PASS），
但它们是 `upstream-unchanged` —— **与上游字节完全相同**。
`model.mjs` 的 `classify()` 里有：

```js
const reviewConflict =
  !!match && ["original", "independent-replacement"].includes(review?.decision);
```

→ 登记 `original` 会让 `review.status = "conflict"` → `reviewProblems` 上升 → `provenance:report` 退出码 1。
**所以这 2 个保持 `upstream-unchanged`，仍属「待真正重写」**（重写后字节不再相同，才能登记）。

**登记方式**（遵循仓库 167 个 `original` 先例）：

- `classification: "original"`
- `decision: "original"`（**不是** `independent-replacement` —— 计划书明文「只保留给以前由隔离作者完成的批次，不混用」）
- `basis`：如实写「纯声明型 + 声明模式计分 + residual-lines=0 / containment 0.000 / run 0 / structural 0.000 + 读过被替换实现」

**⚠️ 这不是「绕过门槛」**，而是按计划书「合同写死的纯声明文件用声明模式计分」的口径计分。
这 9 个文件的实现本来就是类型声明与转发，**没有可重写的逻辑**。

---

## 9. 盲写的适用边界（2026-10-22 最终版）

### 9.1 背景：本包的合同是「结构合同」

`behavior.md` 的 33 个章节全部是**结构约束**（B0 可加载 / B1 范围 / B2 分组 / B3 导出总数守恒 /
B4a–d I/O 分类与冻结 / B5a–d 模块级副作用与 env 读取 / B6–B8 依赖方向与拓扑 /
B10 公开面完整性），**没有一条规定「函数该做什么」**。

所以「依据合同独立重写」对多数文件只能靠**阅读旧实现推断行为** —— 而这会带来锚定效应。

**实测对比**（同一批文件，读后改写 vs 合同盲写）：

| 文件                                     | 读后改写 |      盲写 |  差距 |
| :--------------------------------------- | -------: | --------: | ----: |
| `system/systemService.ts`                |    0.594 | **0.127** | 0.467 |
| `system/system-probe/defaultAdapters.ts` |    0.688 | **0.171** | 0.517 |

**锚定效应是真实且显著的** —— 所以替换阶段一律优先尝试「合同盲写」。

### 9.2 ✅ 可盲写的 4 类

| 类型                    | 特征                                            | 实例                                  |
| :---------------------- | :---------------------------------------------- | :------------------------------------ |
| ① 纯变换                | 输入 → 输出，无副作用，行为可由类型与函数名推出 | `terminalProfileMacOsDecode`（0.163） |
| ② 纯转发                | 调另一个函数/服务，只做形状转换                 | `usageStatsService`                   |
| ③ 状态管理              | 内部状态机，状态迁移语义由接口定义              | `subagentServiceState`                |
| ④ 路径拼接 / 字符串处理 | 纯计算，无外部协议                              | `dataLocationOwner`、`tokens`         |

### 9.3 ❌ 不可盲写的 3 类

| 类型                         | 特征                                     | 实例                                                                                                                  | 处置           |
| :--------------------------- | :--------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------- |
| ① **API 调用约定主导**       | 外部工具/协议要求「必须以固定形式调用」  | `ssh-alias/query.ts`（`ssh -G -F <root> -o BatchMode=yes`）、`terminalProfileMacOs.ts`（`plutil -convert json -o -`） | 如实记录不可达 |
| ② **合同不规定行为的大文件** | > 200 行状态机，合同只有导出签名         | `windowHostControllerService.ts`（805 行，导出 1 个函数，behavior.md 0 条）                                           | 报 lead 裁决   |
| ③ **数据表主导**             | 需要逐字相同的表（plist 键名、颜色名等） | 走声明模式（`--declaration`），不盲写                                                                                 | 见 §8          |

### 9.4 ⚠️ 「行为可从签名推出」不是充分条件

`ssh-alias/query.ts` 的反例：

- 3 个导出签名（`findSSH` / `queryAlias` / `mapWorkers`）的行为**完全可以从名字推出**
- 但盲写实测 **0.400**（`run=12`）

原因：`queryAlias` 的核心必须是

```ts
spawn(executable, ["-G", "-F", root, "-o", "BatchMode=yes", alias], {
  stdio: ["ignore", "pipe", "ignore"],
  windowsHide: true,
  env: { ...process.env, SSH_ASKPASS_REQUIRE: "never", SSH_ASKPASS: "", DISPLAY: "" },
});
```

这 6 行是「如何调用 ssh」的**公开事实**，任何实现都逐字相同。

**→ 判据补充：可盲写 = 行为可推出 **且** 无外部 API 调用约定。**

### 9.5 目前已知的六类数学不可达

|  #  | 类别                 | 判据                                                         | 实例                                                    |
| :-: | :------------------- | :----------------------------------------------------------- | :------------------------------------------------------ |
|  ①  | 高契约密度           | 契约面占比 ≥ 0.40                                            | `accessor.ts` 97.2% 等 8 个                             |
|  ②  | 数据表主导           | 数据表占归一化行比例高，且不走声明模式                       | `terminalProfileMacOsDecode`（走声明模式后解决）        |
|  ③  | 剔除后不足 10 行     | declaration 后 residual < 10 → 计划书要求 `containment == 0` | `terminalProfilePortablePlan`(8) / `terminalProfile`(2) |
|  ④  | interface 密集       | residual 主要是 interface 声明与字段行                       | `systemService`（但盲写后解决）                         |
|  ⑤  | 通用 Node API 主导   | residual 大量是 `net` / `fetch` / `setTimeout` 等标准调用    | `defaultAdapters`（但盲写后解决）                       |
|  ⑥  | **API 调用约定主导** | 外部工具的固定命令行/参数/文案                               | `ssh-alias/query.ts`（0.400）                           |

**⚠️ ①②③④⑤ 的分类是在「读后改写」口径下归纳的** ——
**盲写能解决其中 ④⑤ 两类**（`systemService` 0.594→0.127、`defaultAdapters` 0.688→0.171）。
**而 ⑥ 是盲写也无法解决的**（API 调用约定与读不读旧实现无关）。

### 9.6 投入前的判断顺序（最终版）

```
① 人工读文件（1-2 分钟）：判断「纯声明 / 有实现」
   → 纯声明 → 声明模式计分（§8）
   → 有实现 → 继续
② 判断「是否 API 调用约定主导」
   → 是（ssh/git/plutil/conpty 的固定命令行）→ 不可达，如实记录
   → 否 → 继续
③ 判断「文件规模」
   → > 200 行且合同只有导出签名 → 报 lead（合同信息不足）
   → ≤ 200 行 → 合同盲写
④ 盲写后实测 normal 口径
   → PASS → 登记
   → FAIL 且 run ≥ 8 → API 约定或固定骨架，判不可达
   → FAIL 且 run < 8 → 零散巧合，可再优化一轮
```
