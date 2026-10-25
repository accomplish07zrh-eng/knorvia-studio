# M3 替换阶段的标准流程（模板）

**2026-10-22 在 `terminalProfileMacOsDecode.ts` 上完整验证**（1.000 → 0.163）。

---

## 一、六步流程

### 步骤 ⓪ 投入前的「residual-lines 预判」（**必做，5 分钟**）

**先用 `--declaration --interface` 跑原版（不重写任何代码）**：

| residual-lines | 判定           | 原因                                                               |
| :------------- | :------------- | :----------------------------------------------------------------- |
| **< 10**       | **几乎不可达** | 计划书明文「少于 10 行的，包含率为 0」→ 而 `import` / `}` 必然命中 |
| **10–20**      | **谨慎**       | 每命中 1 行 = 0.05–0.10，极难降到 0.20                             |
| **> 20**       | **可投入**     | 有足够稀释空间                                                     |

**⚠️ 还要预判「提纯数据表后是否 < 10」** ——
整块剔除会让 residual-lines 进一步降低，可能把「12 行」变成「8 行」而触发更严规则。

**实证**：`terminalProfilePortablePlan.ts` 花 40 分钟重写才发现不可达（residual 8 行）；
用这条判据后 `terminalProfile.ts` **5 分钟即判死**（residual-lines=2）。

### 步骤 ① 用 `isPureDataConst` 找出纯数据 const

```js
import { isPureDataConst } from "./scripts/provenance/similarity-declarations.mjs";
```

**判据**（工具源码 `similarity-declarations.mjs:369`）：

- ✅ 允许：字面量、数组、对象、`as const`、`satisfies`、类型注解、`Object.freeze(...)`、zod 声明式构造链
- ❌ 不允许：箭头函数、`function`、条件（`? :`）、逻辑/算术运算、模板插值、展开、其他调用
- 特别地：`.refine(fn)` / `.transform(fn)` 这类夹带函数的不算纯数据

**只有返回 `true` 的 const 块才能被「整块剔除」。**

### 步骤 ② 把「数据+逻辑混合块」展开成纯数据

**典型形态**（本次实例）：

```ts
// ❌ 非纯数据（含箭头函数 + 模板插值 + .map()）
const fields = {
  iterm2: [
    ...palette.map(
      (key, index): ColorField => [key, [`Ansi ${index} Color`, `ANSI ${index} Color`]],
    ),
  ],
};

// ✅ 纯数据（16 条字面量）
const fields = {
  iterm2: [
    ["black", ["Ansi 0 Color", "ANSI 0 Color"]],
    ["red", ["Ansi 1 Color", "ANSI 1 Color"]],
    // …16 条
  ],
};
```

**⚠️ 这是真实改进，不是「为过线而改」**：

- 数据表只应含数据，生成逻辑不该内嵌在数据里；
- 新增一条只需加一行字面量，不必理解 `map` 的下标计算；
- 展开后 `isPureDataConst` 返回 `true` → 可整块剔除。

### 步骤 ③ 在 `interface.md` 新增「纯数据常量表」章节

**必须包含**：

1. **逐条列名**（const 名 + 成员值）；
2. **外部格式出处** —— 不能只写「这是契约」，要写「为什么是契约」：
   - iTerm2 动态配置的 `Ansi <n> Color` 键
   - Apple Terminal `.terminal` plist 的 `TextColor` / `ANSI<Name>Color` 键
   - 等宽编程字体的公开族名
   - 系统公开目录约定（`/usr/local/bin` 等）

**⚠️ 只列「数据表名」，不列「函数名」** ——
否则 `--declaration` 会把函数实现行也剔掉，造成「剔过头」。

### 步骤 ④ 重写解析/解码逻辑

**要求**：

- **行为完全保持**（35 个契约测试全绿）；
- **结构显著不同**（`structural` 接近 0）。

**本次实例的重写手法**（都是真实改进）：
| 原实现 | 重写后 | 收益 |
| :--- | :--- | :--- |
| `record` / `text` / `numeric` 各自守卫 | `asRecord` / `asText` / `asNumber` 统一值提取 | 边缘情形集中处理 |
| `alias` 的循环 | `pickAlias` 用 `find` | 一行表达 |
| `fontSize` + `component` | 统一的量纲归一化（`COMPONENT_SCALES`） | 三种量纲一处定义 |
| `color` 的双分支 | `colorFromString` + `colorFromComponents` + `colorOf` | 格式判定与分量解析分离 |
| `candidates` 的双分支 | `macTerminalCandidates` + `itermCandidates` + `candidateProfiles` | 每种 app 一个函数 |

### 步骤 ⑤ 用 `--declaration --interface` 重测

```powershell
node scripts/provenance/similarity.mjs `
  --repo <worktree> `
  --candidate-list <files> --old-list <同一批 files> --old-rev beff12b5 `
  --upstream-dir "D:\knorvia studio开发\cache\zcode-872ad960" `
  --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521 `
  --declaration --interface specs/contracts/services-04/interface.md
```

**看四个数**：`stripped-blocks` / `residual-lines` / `containment` / `run` / `structural`。

### 步骤 ⑥ 判定

| 条件                                                             | 处置                                                                                |
| :--------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| `containment < 0.20` **且** `run < 8` **且** `structural < 0.40` | **达标**                                                                            |
| `containment ≥ 0.20` **但** `run < 8` **且** `structural < 0.40` | **如实记录「结构已完全不同，containment 卡在语言通用模式」**，保持 `pending-rework` |
| 其他（`run ≥ 8` 或 `structural ≥ 0.40`）                         | **继续重写**                                                                        |

---

## 二、⚠️ 关键判据：`run` 与 `structural` 的意义

```
run=1 + structural=0.000  →  **结构完全不同**（不是「没改」）
```

**此时若 `containment` 仍 > 0.20 → 命中的是「语言通用模式的零散巧合」**：

- `return undefined;`
- `if (typeof value === "string")`
- `const entries: ... = [];`
- `return trimmed;`
- `}`

**⚠️ 这类命中无法通过重写消除** ——
因为**等价改写仍会产生新的巧合匹配**（本次实测：把 `if` 改成三元、把 `for` 改成 `find`，
`containment` 仍是 0.220）。

**→ 所以应如实记录，不硬改。**

---

## 三、可达性的两个来源（本次修正的重要认识）

**「契约面占比」只是「下界的一个来源」**：

| 来源               | 说明                                            |            能否通过重写消除             |
| :----------------- | :---------------------------------------------- | :-------------------------------------: |
| **① 契约面**       | `interface` / 导出签名 / `import` / 数据表      | 数据表可通过声明模式剔除；契约面不可改  |
| **② 语言通用模式** | `return undefined;` / 类型守卫 / 空数组初始化等 | ❌ **无法消除**（等价改写仍会巧合匹配） |

**⚠️ 所以「契约占比低」不代表「能达标」**：
`terminalProfileMacOsDecode` 契约占比仅 **0.017**，但重写后仍 **0.220** ——
因为来源 ② 贡献了约 0.20。

**判据修正**：

> **可达性 = 契约面占比 + 语言通用模式的下限（经验值约 0.18–0.22）**
> 只有当「契约面占比 < 0.02」**且**「文件足够大（语言模式占比被稀释）」时，才有可能 < 0.20。

---

## 四、本次实例的完整数据（`terminalProfileMacOsDecode.ts`）

| 阶段                            | 归一化行 | containment |   run | structural | stripped-blocks |
| :------------------------------ | -------: | ----------: | ----: | ---------: | --------------: |
| 原始（normal 模式）             |      142 |   **1.000** |   142 |      1.000 |               — |
| 原始（声明模式，未列名）        |       40 |       1.000 |     6 |      0.049 |               2 |
| 展开 fields（声明模式，已列名） |       34 |       1.000 |     6 |      0.000 |               4 |
| **重写解析逻辑**                |   **50** |   **0.220** | **1** |  **0.000** |           **4** |

**最终：`residual-lines=50`，命中 11 行（全部为单行巧合，`run=1`）。**

---

## 五、批量执行的顺序

按「契约面占比」从低到高：

| 档位                 | 文件数 | 归一化行 | 说明                               |
| :------------------- | -----: | -------: | :--------------------------------- |
| < 0.05               |     11 |    3,053 | **先做**（本次已验证 1 个：0.220） |
| 0.05–0.15            |     13 |    1,260 | 其次                               |
| 0.15–0.20            |      3 |      267 | 再次                               |
| 0.20–0.27（边界）    |      6 |      248 | 最后试                             |
| ≥ 0.30（明确不可达） |      9 |      270 | 如实记录                           |

**⚠️ 建议先做 3 个不同规模的验证（小 / 中 / 大）再批量** ——
若 3 个里至少 1 个达标 → 说明可达 → 继续；
若 3 个都卡在 0.20–0.25 → 报 lead 判断。

---

## 六、提交时的注意

**⚠️ 不要提交临时脚本**：

```
.tmp-*.txt / scripts/tmp-*.mjs / .tmp-*.json
```

**用明确路径 `git add`，不用 `git add -A`。**

**⚠️ 改善型 PR 的标题格式**（未达标但结构已完全不同）：

```
rework(services): <文件> 声明模式 <原值> → <新值>（未达标，结构已完全不同）
```

**PR body 要写清 `run` / `structural` 作为「结构已完全不同」的证据。**
