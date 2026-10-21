# services-03 行为规格（`studio-runtime/domain` 层）

本包�?`studio-runtime` �?*纯逻辑�?*：类型、校验、解析、策略计算�?**不含 I/O、不含子进程、不读环境变�?* —�?因此行为面主要由**纯函数契�?*构成，非常适合黑盒断言�?
约定：每�?B 都对应一个可执行断言�?*导出面与签名�?oracle �?`interface.md`�?*

---

## 一、范围与分组（B1–B3�?
### B1 范围清单
31 个文件、分类分�?`unreviewed 14 / original 17` �?`scope-files.json` 冻结值一致�?
### B2 按功能簇分组
8 个功能簇覆盖全部 31 个文件，**无遗漏、无重复**（`gen-interface.mjs` 会因未分组模块而报错）�?
| �?| 文件�?| 代表模块 |
| :--- | :-: | :--- |
| 内核策略与能�?| 5 | `kernelPolicy`�?2 导出�?3 处外部引用） |
| 工作流与引用解析 | 6 | `reference`�?99 行，本层最大）· `workflowGraph` · `condition` |
| 输出与产�?| 2 | `outputRef`�?2 导出）�?`outputBuild` |
| 群聊与工具策�?| 3 | `groupPolicy` · `groupPrompts` · `agentToolPolicy` |
| 工作区运行时与图�?| 5 | `workspaceRuntime` · `workspaceImage` · `imageInput` |
| 校验与规范化 | 3 | `validation`�? 导出�?4 处外部引用）· `canonicalValue` · `staticPng` |
| 身份与权�?| 6 | `projectIdentity`�?*7 行但 13 处外部引�?*）�?`remoteAgentIdentity`�?4 �?10 处） |
| 能力矩阵 | 1 | `capabilityMatrix` |

### B3 导出总数守恒
31 个模块合�?**192 项导�?*（`extractExports` 实测），�?`interface.md` 逐模块一致�?
---

## 二、纯逻辑层的不变量（B4–B7�?
### B4 �?I/O 依赖
31 个文�?*不得 import** 任何 I/O 相关内置模块�?`node:fs`、`node:fs/promises`、`node:child_process`、`node:net`、`node:http`、`node:https`�?`node:dgram`、`node:tls`、`node:worker_threads`�?
> 理由：`domain/` 是纯逻辑层，�?`app/` �?`adapters/` 向下依赖�?> 一旦它读文件或起子进程，整个分层就失去「可纯函数测试」的优势�?
### B5 无环境变量读�?31 个文�?*不得出现** `process.env`�?
> 理由：配置由上层（`app/`）注入；`domain/` 若读环境变量，同一函数在不同环境下行为不同�?> 破坏可测试性，也违反「配置层级明确」的架构要求�?
### B6 无子进程
31 个文�?*不得出现** `spawn`、`exec`、`execFile`、`fork`、`execSync`、`spawnSync`�?
> 这条�?B4 部分重叠，但单独列出是因为它�?`services-01` �?*主要 flake 来源**
> （见 `services-01/known-differences.md` KD-x）；
> `services-03` 作为纯逻辑层，**从设计上就不该有这个风险**�?
### B7 无模块级可变状�?31 个文�?*不得有顶�?`let`/`var`**�?
> 理由：纯函数层若持有模块级可变状态，就成了隐式的单例缓存�?> 在并发调用下行为不确定，且测试之间会互相污染�?
---

## 三、依赖方向（B8–B10�?
### B8 不向上依�?31 个文�?*不得 import** `app/` �?`adapters/` 下的模块（值导入与类型导入都不允许）�?
> 理由：`domain/` 是最底层之一（只依赖 `services-02` 的契约声明）�?> 向上依赖会形成循环：`app �?domain �?app`�?
**⚠️ 注意�?`services-02` 的区�?*：`contract.ts`（在 `services-02`）用 `export *`
聚合本层�?3 个模块（`imageInput` / `outputRef` / `reference`）—�?那是**入口聚合职责**�?不是本层的依赖边。本包只保证�?3 个模�?*自身**不向上依赖�?
### B9 层内依赖不扩�?实测层内依赖 **21 条边**（`scope.mjs` �?`INTERNAL_EDGES` 逐条冻结），**31 个文件里 22 个参与�? 个完全独�?*�?
**4 个汇聚点**（被层内依赖最多）�?
| 模块 | 被层内依�?| 说明 |
| :--- | :-: | :--- |
| `kernelPolicy` | 4 | 内核策略核心（也�?33 处外部依赖） |
| `outputRef` | 3 | 输出引用 |
| `kernelIdentity` | 3 | 内核身份 |
| `workspaceSecrets` | 2 | 工作区密�?|

**4 个叶�?*（无层内依赖）：`capabilityMatrix` / `canonicalValue` / `staticPng` / `referencePath`�?
**⚠️ 早期侦察稿写的是�? 条边 / 27 个文件互不引用」，实测后更正为 21 �?/ 9 个独�?*
—�?侦察脚本只扫了「层外引用」，漏了层内 import。同 K2 的口径问题：**「grep 找不到」≠「不存在�?*�?
**替换阶段不得新增层内依赖�?*（新增即意味着模块边界变了，需重新审合同）�?
### B10 被引用面守恒
本层被外部依�?**176 �?*（实测）�?
| 引用�?| 处数 |
| :--- | ---: |
| `adapters/`�?0 文件�?| **61** |
| `app/`�?5 文件�?| **71** |
| `packages/services/test/` | **35** |
| 根级（`services/src/*.ts`�?| **9** |

**最不能变签名的 6 �?*（按外部引用降序，实测）�?
| 模块 | 外部引用 | app | adapters | test | root |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `kernelPolicy` | **33** | 3 | **26** | 4 | 0 |
| `validation` | **14** | 12 | 0 | 2 | 0 |
| `projectIdentity` | **13** | 8 | 1 | 4 | 0 |
| `remoteAgentIdentity` | **10** | 4 | 5 | 1 | 0 |
| `workflowGraph` | **10** | 4 | 0 | 4 | 2 |
| `outputRef` | **9** | 6 | 0 | 1 | 2 |

**⚠️ 两个「零外部引用」的模块不是死代�?*（见 B14）：`referencePath` / `staticPng`
—�?它们的唯一使用者都�?*层内**�?
---

## 四、端口的三个 domain 模块（B11–B13�?
`services-02` �?`contract.ts` �?`export *` 聚合了本层的 3 个模块：

| 模块 | �?| 导出 | 运行时导�?| 特�?|
| :--- | ---: | ---: | ---: | :--- |
| `imageInput` | 128 | 6 | 6 | �?3 个校验函�?+ `studioImageRef` |
| `outputRef` | 328 | 22 | 16 | 本层导出最�?|
| `reference` | 399 | 17 | 9 | 本层行数最�?|

### B11 �?3 个模块的导出面完�?它们的导出必须全部可用（因为 `contract.ts` 把它们转发为包公开面）�?
### B12 `import type` 不算向上依赖
`services-02` �?`workflowTypes.ts` �?1 �?`import type { StudioOutputRef } from "./domain/outputRef.js"`�?**那是契约层对 domain 的类型引�?*（编译期擦除，不构成运行期依赖边）；
本包**接受**这类反向类型引用，不视为违反 B8�?
### B13 3 个模块的层内位置
`imageInput` 依赖 `validation`（层内）；`outputRef` 依赖 `workflowGraph`（层内）�?`reference` 无层内依赖�?*�?3 条边已在 B9 �?10 条里计数**�?
---

## 五、两个「看似无用」的模块（B14–B15�?
侦察时曾把这两个标为「零层外引用」，**实际都有层内使用者，不是死代�?*�?
| 模块 | �?| 使用�?| 说明 |
| :--- | ---: | :--- | :--- |
| `staticPng` | 44 | **`imageInput.ts:3,91`** | PNG CRC 校验 |
| `referencePath` | 83 | **`reference.ts:25,32`** | 引用路径规则（类型与判定函数�?|

### B14 这两个模块必须保�?它们的导出必须可用；**不得因为「零外部引用」而删�?*�?
### B15 `referencePath` �?`reference` 的职责分�?`referencePath` �?*纯规�?*（路径是否可接受 + 拒绝理由分类），
`reference` �?*完整解析流程**（用它判�?+ 产出 verdict）�?这份分离是刻意的（见 `referencePath.ts` 头注释：`�?reference.ts 的解析流程分开`）�?**替换时不得把两者合�?*——那会让「路径规则」无法单独测试�?
---

## 六、条�?�?测试对照�?
| 条目 | 行为规格 | 测试文件 | 断言 |
| :---: | :--- | :--- | :--- |
| B1 | 范围清单 | `surface.test.mjs` | �?1 文件：分类计数与冻结值一致�?|
| B2 | 功能簇分�?| `surface.test.mjs` | �? 个簇覆盖全部 31 文件，无遗漏无重复�?|
| B3 | 导出总数守恒 | `surface.test.mjs` | �?92 项导出，�?interface.md 逐模块一致�?|
| B4 | �?I/O 依赖 | `purity.test.mjs` | �?1 文件�?import 任何 node I/O 模块�?|
| B5 | 无环境变�?| `purity.test.mjs` | �?1 文件�?process.env�?|
| B6 | 无子进程 | `purity.test.mjs` | �?1 文件�?spawn/exec/fork�?|
| B7 | 无模块级可变状�?| `purity.test.mjs` | �?1 文件无顶�?let/var�?|
| B8 | 不向上依�?| `dependencies.test.mjs` | �?1 文件�?import app/ �?adapters/�?|
| B9 | 层内依赖不扩�?| `dependencies.test.mjs` | 「层内依赖边 �?10 条实测边�?|
| B10 | 被引用面守恒 | `dependencies.test.mjs` | �?76 处外部引用，最重的 5 个签名不变�?|
| B11–B13 | 端口 3 模块 | `surface.test.mjs` | �? 个模块导出面完整；import type 反向引用被接受�?|
| B14–B15 | 两个「看似无用」模�?| `purity.test.mjs` | 「staticPng / referencePath 有层内使用者且必须保留�?|

---

## 七、本包不覆盖的行�?
- `app/`�?5 件）的运行时编排：`services-04`～`services-06`�?- `adapters/`�?0 件）�?I/O：`services-07`/`08`�?- `services-02` 的契约声明与端口：已�?`#265` 合并�?