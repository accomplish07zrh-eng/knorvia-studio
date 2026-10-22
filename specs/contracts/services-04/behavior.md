# services-04 行为规格（`packages/services/src` 编排层）

本包是 **`packages/services/src` 的编排层**：服务注册基础设施、子 Agent、系统探测、终端、
用量统计、窗口控制。**允许 I/O**（14 个文件有真 I/O），但要求 I/O 分布可识别、可冻结。

约定：每条 B/C 都对应一个可执行断言。**导出面与签名的 oracle 是 `interface.md`。**

---

## 一、范围与分组（B0–B3）

### B0 全部 46 个实现文件必须可加载（运行期守卫前置）

**这是所有静态断言的前置条件。**

契约包的断言大量依赖静态分析（读源码文本 / JSON / `interface.md`），
而桩替换只把模块顶层改成 `throw`、按 AST 声明导出名 ——
**纯静态断言在桩下照样成立，旧门的 `allFail` 防线会失效**（详见 `known-differences.md` §4）。

所以 B0 先证明「46 个模块能真实加载」，任何静态断言都必须排在它之后。

### B1 范围清单

46 个实现文件、5,635 行、197,458 字节、分类分布与 `scope-files.json` 冻结值一致：

| 分类                 | 数量 |
| :------------------- | ---: |
| `upstream-modified`  |   20 |
| `unreviewed`         |   18 |
| `original`           |    6 |
| `upstream-unchanged` |    2 |

### B2 按计划书 L215 的 7 项分组

| 组                   | 文件  |    行 |  导出 |
| :------------------- | :---: | ----: | ----: |
| `window-controller/` |   5   | 1,805 |    22 |
| `terminal/`          |  12   | 1,268 |    30 |
| `subagents/`         |   8   | 1,144 |    25 |
| `system/`            |  12   |   972 |    31 |
| `.`（根）            |   7   |   418 |    34 |
| `usage-stats/`       |   2   |    28 |     3 |
| `types/`             | **0** | **0** | **0** |

**⚠️ `types/` 计划书列了但实际无 `.ts` 实现**（只有 `types/yazl.d.ts` 第三方类型垫片，见 K-y）。

### B3 导出总数守恒

46 个模块合计 **145 项导出（运行时 99 / 纯类型 46）**，且**逐模块与 `interface.md` 一致**。

---

## 二、I/O 的分类与冻结（B4）

**本层与 `services-03`（纯逻辑层）的**本质差异**：本层允许 I/O。**

| 层                                       |  文件  |  有 node 依赖   |
| :--------------------------------------- | :----: | :-------------: |
| `services-03`（`studio-runtime/domain`） |   31   | **0**（纯逻辑） |
| **`services-04`（`src` 编排层）**        | **46** | **20**（43.5%） |

**若照搬「无 I/O」的断言 → 合同第一天就红。** 所以改为三条可测规则：

### B4a 真 I/O 的目录白名单

**真 I/O**（`node:fs` / `node:fs/promises` / `node:child_process` / `node:net` / `node:http` / `node:https`）
**只允许出现在 4 个组**：`system/` / `subagents/` / `terminal/` / `.`（根）。

**理由**：这三类模块的语义本身就要求碰文件/进程/网络 ——
系统探测要跑命令、终端管理要读 profile、子 Agent 要读 markdown 定义。

### B4b 纯工具模块不限制

`node:path` / `node:os` / `node:util` / `node:crypto` / `node:url` 是**纯计算**，无副作用，不限制。

**⚠️ 这个区分是关键**：

```
node:path 是纯计算（无副作用）→ 16 个文件用它很正常
node:fs / child_process / net 才是真 I/O → 14 个文件
```

**「把纯计算和真 I/O 分开」是精确分类，不是「一刀切禁止 node:\*」。**

### B4c 真 I/O 的文件清单冻结

**14 个文件**有真 I/O（逐条冻结）；**6 个文件**只用纯工具。
新增/减少即失败（意味着 I/O 边界变了，需重新审合同）。

### B4d `usage-stats/` 组必须零 I/O

最小组（2 文件 / 28 行）应保持最简。

---

## 三、模块级副作用（B5）

### B5a 顶层 `await` 必须为 0 处

**强断言**（实测 0 处）。顶层 await 会让模块加载变成异步，破坏同步 import 语义。

### B5b 模块级 `const X = <调用>()` 冻结 6 处

```
dataLocationOwner.ts#capturedDataBase        ← 技术债（K-v-4）
dataLocationOwner.ts#capturedAppRoot         ← 技术债
dataLocationOwner.ts#capturedDefaultBase     ← 技术债
subagents/subagentsService.ts#logger         ← 合理（日志器单例，无 I/O）
terminal/terminalProfile.ts#externalDetectors ← 合理（检测器表，纯数据构造）
terminal/terminalService.ts#require          ← 合理（createRequire 拿句柄，不调用）
```

**新增即失败** —— 新模块级副作用会被立刻发现。

### B5c `process.env` 读取冻结 8 个文件

```
dataLocationOwner.ts / paths.ts / subagents/subagentStorage.ts /
subagents/subagentsService.ts / system/ssh-alias/query.ts /
system/systemServiceOwner.ts / terminal/terminalProfile.ts / terminal/terminalService.ts
```

**新增即失败**（配置读取路径变了，需重新审）。

### B5d 技术债登记：`dataLocationOwner.ts` 的 3 处模块级 env 快照（**已偿还，2026-10-22**）

见 `known-differences.md` K-v-4：

```ts
const capturedDataBase = process.env.KNORVIA_DATA_BASE_DIR?.trim() || null;
const capturedAppRoot = process.env.KNORVIA_HOME?.trim() || null;
const capturedDefaultBase = process.env.HOME?.trim() || homedir();
```

**问题**：import 时就固化 env → 之后改 `process.env` 不生效；测试无法在 import 前注入环境。
**本合同的 B5 冻结它（而非禁止）** —— 因为它是既有实现，且「数据目录在进程启动时确定」这个语义本身合理。
**替换阶段应改为注入式**，届时同步更新 B5b/B5c 的冻结清单。

**✅ 偿还记录（2026-10-22）**：

- 移除 3 处模块级 env 快照（`capturedDataBase` / `capturedAppRoot` / `capturedDefaultBase`）
- 改为「首次使用时解析 + 缓存 + `setDataBaseDir` 可失效缓存」
- **B5b 冻结清单同步删除 3 条**（剩 3 条：`subagentsService#logger` / `terminalProfile#externalDetectors` / `terminalService#require`）
- **B5d 测试改为「断言债务已偿还」**（无模块级 env 快照 + `setDataBaseDir` 存在）
- 语义更强：从「允许存在」变成「必须不存在」

---

## 四、依赖方向与拓扑（B6–B8）

### B6 无循环依赖

层内依赖图必须是 **DAG**（实测无环）。

### B7 层内依赖不扩大

**64 条层内依赖边**逐条冻结：

- **18 个汇聚点**（入度 ≥2）：`descriptors`(6) 与 `terminal/terminalProfileTypes`(6) 并列最高；
- **16 个叶子**（无层内依赖）。

**新增或减少任何一条边即失败**（模块边界变了）。

**⚠️ 本层比 `services-03` 耦合紧得多**：
| 层 | 层内边 | 汇聚点 | 叶子 |
| :--- | ---: | ---: | ---: |
| `services-03`（domain） | 21 | 6 | **17** |
| **`services-04`（app）** | **64** | **18** | 16 |

### B8 依赖方向

- **不得 import** `adapters/` 或 `studio-runtime/adapters/`（向上依赖）；
- **跨组分依赖只允许 3 个目标**：

| 目标目录   |  处数 | 归属        |
| :--------- | ----: | :---------- |
| `agent/`   |     3 | services-01 |
| `session/` |     4 | services-03 |
| `setting/` |     1 | services-03 |
| **合计**   | **8** |             |

**新增跨到第 4 个目录即失败。**

---

## 五、公开面完整性（B10 + K-z）

### B10 被引用面守恒（两种口径）

| 口径            | 含义                                                |                                                   实测 |
| :-------------- | :-------------------------------------------------- | -----------------------------------------------------: |
| **A. 直接引用** | 外部文件直接 import 本层 46 个实现文件之一          | **18 处**（`services/test` 15 + `packages/desktop` 3） |
| **B. 经聚合桶** | 通过 `@knorvia/services` / `@knorvia/services/node` |                             **379 个文件**（345 + 34） |

**⚠️ 38 / 46 个模块零直接引用（口径 A）** —— 若只看口径 A，会误判「82.6% 是死代码」。
**它们全部通过聚合桶或层内依赖被使用**（B10 断言 + K-w）。

### B10 零直接引用模块的存活证明

38 个模块里：**11 个经聚合桶转发**、**30 个被层内依赖**（有重叠）；
**唯一两个证明都拿不到的是 `window-controller/node`** ——
它是子聚合桶（纯转发 5 行），全仓零引用，见 K-w（**惰性公开入口，非死代码**）。

### K-z 转发面完整性（运行期校验）

**聚合桶 `index.ts`（56 条转发）/ `node.ts`（88 条转发）不纳入实现范围**，
但必须验证「转发的每个符号都能在运行期取到」：

```ts
const loaded = await importBarrel("index");   // 或 "node"
for (/* 每条运行时转发的符号 */ name) {
  assert(name in loaded, `${barrel}#${name} 在聚合桶里取不到`);
}
```

**实测**：校验 >100 个运行时转发符号，**0 缺失**。

**⚠️ 纯类型转发跳过**（运行期不存在），由 C3 的 `tsc -b` 保障。

**⚠️ 这个断言我写错过两次**（见 K-z-2）：静态解析看不穿多级转发 → **运行期即真理**。

---

## 六、类型检查（C0–C6）

### C0 桩检测（三条行为特征，不依赖错误文案）

1. 模块导入时直接抛错；
2. 有运行时导出但全部为 `undefined`。

**⚠️ 不依赖桩的错误文案**（`not implemented: services-04`）——
依赖文案会把测试耦合到桩生成器上（文案一改，检测失效而测试仍绿）。

### C1 聚合桶可加载 + 无 undefined 导出值

`index.ts` / `node.ts` 各 >20 个运行时导出，且**无导出值为 `undefined` 的符号**
（那是转发失效的征兆）。

### C2 tsc 可执行文件存在

### C3 项目引用类型检查通过（根级 `tsc -b`）

```powershell
tsc -b packages/rpc packages/provider packages/provider-node packages/shared packages/services
```

**⚠️ 不能只跑 `tsc --noEmit -p packages/services`** ——
会因项目引用未构建报 `TS6305`（不是签名错误，是构建顺序问题）。

### C4 46 个文件都有编译产物（`.d.ts`）

### C5 冻结统计自洽（文件/行/字节/导出）

### C6 导出面与 `interface.md` 逐模块交叉校验

**⚠️ 与 `surface.test.mjs` 的 B3 是两份独立实现的同一校验**（防「同一处 bug 让两边都错」）。

---

## 七、条目 → 测试对照表

| 条目  | 规格               | 测试文件                | 断言                                                         |
| :---: | :----------------- | :---------------------- | :----------------------------------------------------------- |
|  B0   | 全模块可加载       | `surface.test.mjs`      | 「46 个实现文件必须可加载」                                  |
|  B1   | 范围清单           | `surface.test.mjs`      | 「46 文件 + 分组 + 行数字节分类」×2                          |
|  B2   | 分组覆盖           | `surface.test.mjs`      | 「interface.md 覆盖 46 模块，无遗漏无重复」                  |
|  B3   | 导出总数守恒       | `surface.test.mjs`      | 「145 项导出逐模块一致」                                     |
|  B4a  | 真 I/O 白名单      | `purity.test.mjs`       | 「fs/child_process/net 只在 4 组内」                         |
|  B4b  | 纯工具不限制       | `purity.test.mjs`       | 「≥15 个文件用纯 node 工具」                                 |
|  B4c  | 真 I/O 清单冻结    | `purity.test.mjs`       | 「14 真 I/O + 6 纯工具」                                     |
|  B4d  | usage-stats 零 I/O | `purity.test.mjs`       | 「最小组保持最简」                                           |
|  B5a  | 顶层无 await       | `purity.test.mjs`       | 「0 处」                                                     |
|  B5b  | 模块级副作用冻结   | `purity.test.mjs`       | 「6 处，新增即失败」                                         |
|  B5c  | env 读取冻结       | `purity.test.mjs`       | 「8 个文件，新增即失败」                                     |
|  B5d  | 技术债登记         | `purity.test.mjs`       | 「dataLocationOwner 的 3 处 env 快照」                       |
|  B6   | 无循环依赖         | `purity.test.mjs`       | 「层内依赖图是 DAG」                                         |
|  B7   | 层内依赖不扩大     | `dependencies.test.mjs` | 「64 条边 ⊆ 冻结值」×2（边 + 拓扑）                          |
|  B8   | 依赖方向           | `dependencies.test.mjs` | 「不 import adapters/」+「跨组 3 目录 8 处」                 |
|  B10  | 引用面守恒         | `dependencies.test.mjs` | 「口径 A 18 / 口径 B 379 / 零引用 38」×3 + 「最重 6 个签名」 |
|  K-z  | 转发面完整性       | `surface.test.mjs`      | 「每条转发都能在运行期取到」+「聚合桶可加载」                |
|  K-w  | 子聚合桶性质       | `dependencies.test.mjs` | 「纯转发 + 目标是 scope 内实现」                             |
|  K-y  | 第三方垫片         | `surface.test.mjs`      | 「yazl.d.ts 不属实现范围」                                   |
|  C0   | 桩检测             | `typecheck.test.mjs`    | 「三条行为特征」                                             |
|  C1   | 聚合桶可加载       | `typecheck.test.mjs`    | 「>20 导出且无 undefined」                                   |
| C2–C4 | 类型检查           | `typecheck.test.mjs`    | 「tsc -b 通过 + 46 个 .d.ts」                                |
|  C5   | 统计自洽           | `typecheck.test.mjs`    | 「冻结值一致」                                               |
|  C6   | 导出面交叉校验     | `typecheck.test.mjs`    | 「145 项逐模块一致（独立实现）」                             |

---

## 八、本包不覆盖的行为

| 范围                                                       | 文件数 | 归属                                 |
| :--------------------------------------------------------- | :----: | :----------------------------------- |
| `studio-runtime/domain/`                                   |   31   | `services-03`（已合并 #267）         |
| `studio-runtime/app/`                                      |   45   | `services-05`～`services-06`（待定） |
| `studio-runtime/adapters/`                                 |   60   | `services-07` / `08`（待定）         |
| `studio-runtime/` 根级                                     |   13   | `services-02`（已合并 #265）         |
| `packages/services/src` 其余目录（`agent/` `session/` 等） |   —    | `services-01`～`03`（已合并）        |
| 两个包级聚合桶 `index.ts` / `node.ts`                      |   2    | **不属实现范围**（K-z）              |
| `types/yazl.d.ts`                                          |   1    | 第三方类型垫片（K-y）                |
