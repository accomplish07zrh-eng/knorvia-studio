# services-03 行为规格（`studio-runtime/domain` 层）

本包是 `studio-runtime` 的**纯逻辑层**：类型、校验、解析、策略计算。
**不含 I/O、不含子进程、不读环境变量** —— 因此行为面主要由**纯函数契约**构成，非常适合黑盒断言。

约定：每条 B 都对应一个可执行断言。**导出面与签名的 oracle 是 `interface.md`。**

---

## 一、范围与分组（B0–B3）

### B0 全部 31 个模块必须可加载（运行期守卫前置）

**这是所有静态断言的前置条件。**

契约包的断言大量依赖静态分析（读 JSON、读 `interface.md`、AST 扫源码），
而桩替换只把模块顶层改成 `throw`、按 AST 声明导出名 ——
**纯静态断言在桩下照样成立，旧门的 `allFail` 防线会失效**（详见 `known-differences.md` §4）。

所以 B0 先证明「模块能真实加载」，任何静态断言都必须排在它之后。

### B1 范围清单

31 个文件、分类分布 `original 17 / unreviewed 14`、行数 3,835、字节 154,293
与 `scope-files.json` 冻结值一致。

### B2 按功能簇分组

8 个功能簇覆盖全部 31 个文件，**无遗漏、无重复**（`gen-interface.mjs` 会因未分组模块而报错）。

| 簇                 | 文件数 | 代表模块                                                                            |
| :----------------- | :----: | :---------------------------------------------------------------------------------- |
| 内核策略与能力     |   5    | `kernelPolicy`（22 导出，33 处外部引用）                                            |
| 工作流与引用解析   |   6    | `reference`（399 行，本层最大）· `workflowGraph` · `condition`                      |
| 输出与产物         |   2    | `outputRef`（22 导出）· `outputBuild`                                               |
| 群聊与工具策略     |   3    | `groupPolicy` · `groupPrompts` · `agentToolPolicy`                                  |
| 工作区运行时与图像 |   5    | `workspaceRuntime` · `workspaceImage` · `imageInput`                                |
| 校验与规范化       |   3    | `validation`（10 导出，14 处外部引用）· `canonicalValue` · `staticPng`              |
| 身份与权限         |   6    | `projectIdentity`（**7 行但 13 处外部引用**）· `remoteAgentIdentity`（14 行 10 处） |
| 能力矩阵           |   1    | `capabilityMatrix`                                                                  |

### B3 导出总数守恒

31 个模块合计 **192 项导出（运行时 161 / 纯类型 31）**，且**逐模块与 `interface.md` 一致**。

**构成拆解（实测）**：

```text
声明式导出        181
具名 re-export     11   （如 reference.ts 从 referencePath.ts 转发符号）
star re-export      0
合计              192
```

**重要**：早期侦察稿写「181 导出」，那恰好等于**声明式导出数**，
**漏算了下游 re-export 的 11 个**。统计导出面时 re-export 必须计入，否则「转发型模块」的导出会被低估。

---

## 二、纯逻辑层的不变量（B4–B7）

### B4 无 I/O 依赖

31 个文件**不得 import** 任何 I/O 相关内置模块：
`node:fs`、`node:fs/promises`、`node:child_process`、`node:net`、`node:http`、`node:https`、
`node:dgram`、`node:tls`、`node:worker_threads`。

> 理由：`domain/` 是纯逻辑层，被 `app/` 与 `adapters/` 向下依赖。
> 一旦它读文件或起子进程，整个分层就失去「可纯函数测试」的优势。

### B5 无环境变量读取

31 个文件**不得出现** `process.env`。

> 理由：配置由上层（`app/`）注入；`domain/` 若读环境变量，同一函数在不同环境下行为不同，
> 破坏可测试性，也违反「配置层级明确」的架构要求。

### B6 无子进程

31 个文件**不得调用** `spawn`、`spawnSync`、`execFile`、`execFileSync`、`execSync`、`fork`。

> **实现细节**：检测正则**不能包含裸 `exec`** ——
> 会把 `pattern.exec(source)`（正则方法）误判为 `child_process.exec`。
> 且必须**先剥离注释与字符串字面量**再匹配。

### B7 无模块级可变状态

31 个文件**不得有顶层 `let`/`var`**。

> 理由：纯函数层若持有模块级可变状态，就成了隐式的单例缓存，
> 在并发调用下行为不确定，且测试之间会互相污染。

---

## 三、依赖方向（B8–B10）

### B8 不向上依赖

31 个文件**不得 import** `app/` 或 `adapters/` 下的模块（值导入与类型导入都不允许）。

> 理由：`domain/` 是最底层之一（只依赖 `services-02` 的契约声明）。
> 向上依赖会形成循环：`app → domain → app`。

**注意与 `services-02` 的区别**：`contract.ts`（在 `services-02`）用 `export *`
聚合本层的 3 个模块（`imageInput` / `outputRef` / `reference`）—— 那是**入口聚合职责**，
不是本层的依赖边。本包只保证这 3 个模块**自身**不向上依赖。

### B9 层内依赖不扩大

实测层内依赖 **21 条边**（`scope.mjs` 的 `INTERNAL_EDGES` 逐条冻结），**31 个文件里 17 个是叶子**。

**6 个汇聚点**（被 ≥2 个层内模块依赖）：

| 模块               | 被层内依赖 | 说明                               |
| :----------------- | :--------: | :--------------------------------- |
| `kernelPolicy`     |   **4**    | 内核策略核心（也被 33 处外部依赖） |
| `outputRef`        |     3      | 输出引用                           |
| `kernelIdentity`   |     3      | 内核身份                           |
| `referencePath`    |     2      | 引用路径纯规则                     |
| `workflowParams`   |     2      | 工作流参数                         |
| `workspaceSecrets` |     2      | 工作区密钥                         |

**17 个叶子**（无层内依赖）：`acpPermission` / `agentToolPolicy` / `attentionVersion` /
`canonicalValue` / `capabilityMatrix` / `condition` / `kernelMedia` / `kernelUsage` /
`outputRef` / `projectIdentity` / `referencePath` / `remoteAgentIdentity` / `staticPng` /
`stepReference` / `workspaceRuntime` / `workspaceRuntimeEnvironment` / `workspaceSecrets`。

**早期侦察稿写的是「4 条边 / 27 个文件互不引用」，实测更正为 21 条 / 17 叶子**
—— 侦察脚本只扫了「层外引用」，漏了层内 import。**「grep 找不到」不等于「不存在」。**

**替换阶段不得新增层内依赖边**（新增即意味着模块边界变了，需重新审合同）。

### B10 被引用面守恒

本层被外部依赖 **176 处**（实测）：

| 引用方                      |   处数 |
| :-------------------------- | -----: |
| `app/`（45 文件）           | **71** |
| `adapters/`（60 文件）      | **61** |
| `packages/services/test/`   | **35** |
| 根级（`services/src/*.ts`） |  **9** |

**最不能变签名的 6 个**（按外部引用降序，实测）：

| 模块                  | 外部引用 | app | adapters | test | root |
| :-------------------- | -------: | --: | -------: | ---: | ---: |
| `kernelPolicy`        |   **33** |   3 |   **26** |    4 |    0 |
| `validation`          |   **14** |  12 |        0 |    2 |    0 |
| `projectIdentity`     |   **13** |   8 |        1 |    4 |    0 |
| `remoteAgentIdentity` |   **10** |   4 |        5 |    1 |    0 |
| `workflowGraph`       |   **10** |   4 |        0 |    4 |    2 |
| `outputRef`           |    **9** |   6 |        0 |    1 |    2 |

**两个「零外部引用」的模块不是死代码**（见 B14）：`referencePath` / `staticPng`
—— 它们的唯一使用者都在**层内**。

---

## 四、端口的三个 domain 模块（B11–B13）

`services-02` 的 `contract.ts` 用 `export *` 聚合了本层的 3 个模块：

| 模块         |  行 | 导出 | 运行时导出 | 特性                                          |
| :----------- | --: | ---: | ---------: | :-------------------------------------------- |
| `imageInput` | 128 |    6 |          6 | 含 3 个校验函数 + `studioImageRef`            |
| `outputRef`  | 328 |   22 |         16 | 本层导出最多（与 `kernelPolicy` 并列 22）     |
| `reference`  | 399 |   20 |         12 | 本层行数最多；含 re-export 到 `referencePath` |

### B11 这 3 个模块的导出面完整

它们的导出必须全部可用（因为 `contract.ts` 把它们转发为包公开面）。

### B12 `import type` 不算向上依赖

`services-02` 的 `workflowTypes.ts` 有 `import type { StudioOutputRef } from "./domain/outputRef.js"`。
**那是契约层对 domain 的类型引用**（编译期擦除，不构成运行期依赖边）；
本包**接受**这类反向类型引用，不视为违反 B8。

**但 domain 侧不得反过来**：不能用 `import type` 引入 `app/` 或 `adapters/` 来规避 B8。

### B13 3 个模块的层内位置

`imageInput` 依赖 `staticPng`（层内）；`outputRef` 无层内依赖（叶子）；
`reference` 依赖 `outputRef` 与 `referencePath`。**这些边已在 B9 的 21 条里计数**。

---

## 五、两个「看似无用」的模块（B14–B15）

侦察时曾把这两个标为「零外部引用」，**实际都有层内使用者，不是死代码**：

| 模块            |  行 | 使用者                         | 用法                                                                                |
| :-------------- | --: | :----------------------------- | :---------------------------------------------------------------------------------- |
| `staticPng`     |  44 | **`imageInput.ts:3,91`**       | `validateStaticPng(bytes)`                                                          |
| `referencePath` |  83 | **`reference.ts:23-33,69,94`** | `studioReferencePathReason` / `studioReferencePathDetail` / `StudioReferenceReason` |

### B14 这两个模块必须保留

它们的导出必须可用；**不得因为「零外部引用」而删除**。

### B15 `referencePath` 与 `reference` 的职责分离

`referencePath` 是**纯规则叶子**（路径是否可接受 + 拒绝理由分类，无层内依赖），
`reference` 是**完整解析流程**（用它判定 + 产出 verdict）。

**替换时不得把两者合并**——那会让「路径规则」无法单独测试。

---

## 六、类型检查（C0–C4）

### C0 桩检测（行为特征）

tsc 检查在桩下也会通过（桩是合法的 TS 类型声明）。所以用**行为特征**判定是否为桩：

1. 模块导入时直接抛错；
2. 有运行时导出但全部为 `undefined`。

**不依赖桩的错误文案**（`not implemented: services-03`）——
依赖文案会把测试耦合到桩生成器上。

### C2 项目引用构建

```powershell
tsc -b packages/rpc packages/provider packages/provider-node packages/shared packages/services
```

**不能只跑 `tsc --noEmit -p packages/services`** ——
会因项目引用未构建报 `TS6305`（那不是签名错误，是构建顺序问题）。

### C3 编译产物完整

31 个模块都必须产出 `.d.ts`（证明「签名可编译」而不是「被跳过」）。

---

## 七、条目 → 测试对照表

|  条目   | 行为规格             | 测试文件                                     | 断言                                             |
| :-----: | :------------------- | :------------------------------------------- | :----------------------------------------------- |
|   B0    | 全模块可加载         | `surface.test.mjs`                           | 「全部 31 个模块必须可加载」                     |
|   B1    | 范围清单             | `surface.test.mjs`                           | 「31 文件：分类/行数/字节与冻结值一致」          |
|   B2    | 功能簇分组           | `surface.test.mjs`                           | 「8 个簇覆盖全部 31 文件，无遗漏无重复」         |
|   B3    | 导出总数守恒         | `surface.test.mjs`                           | 「192 项导出，逐模块与 interface.md 一致」       |
|   B4    | 无 I/O 依赖          | `purity.test.mjs`                            | 「31 文件不 import 任何 node I/O 模块」          |
|   B5    | 无环境变量           | `purity.test.mjs`                            | 「31 文件无 process.env」                        |
|   B6    | 无子进程             | `purity.test.mjs`                            | 「31 文件无 spawn/execFile/fork（不含裸 exec）」 |
|   B7    | 无模块级可变状态     | `purity.test.mjs`                            | 「31 文件无顶层 let/var」                        |
|   B8    | 不向上依赖           | `dependencies.test.mjs`                      | 「31 文件不 import app/ 或 adapters/」           |
|   B9    | 层内依赖不扩大       | `dependencies.test.mjs`                      | 「层内依赖边 ⊆ 21 条实测边」+ 拓扑               |
|   B10   | 被引用面守恒         | `dependencies.test.mjs`                      | 「176 处外部引用，分层精确」+ 最重 6 个签名      |
| B11–B13 | 端口 3 模块          | `surface.test.mjs` / `dependencies.test.mjs` | 「导出面完整；import type 反向引用被接受」       |
| B14–B15 | 两个「看似无用」模块 | `purity.test.mjs`                            | 「都是层内使用者且必须保留；职责不得合并」       |
|   C0    | 桩检测               | `typecheck.test.mjs`                         | 「行为特征判定，不依赖错误文案」                 |
|  C2–C3  | 类型检查             | `typecheck.test.mjs`                         | 「tsc -b 通过；31 个 .d.ts 产出」                |
|   C4    | 统计自洽             | `typecheck.test.mjs`                         | 「冻结统计自洽」                                 |

---

## 八、本包不覆盖的行为

- `app/`（45 件）的运行时编排：`services-04`～`services-06`；
- `adapters/`（60 件）的 I/O：`services-07`/`08`；
- `services-02` 的契约声明与端口：已由 #265 合并。
