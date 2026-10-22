# services-04 验收判据

## 一、旧门三段（必须全部通过）

```powershell
node scripts/contract-gate.mjs --contract "specs/contracts/services-04" --tests "*.test.mjs" `
  --dist-env "KNORVIA_SVC04_ENTRY=dist" `
  --stub-targets "specs/contracts/services-04/stubs/targets.txt" `
  --stub-root "specs/contracts/services-04/stubs" `
  --json "specs/contracts/services-04/gate-old.json"
```

| 段                       | 判据                           | 实测                                             |
| :----------------------- | :----------------------------- | :----------------------------------------------- |
| **源码入口**             | 全部通过                       | `tests=35 pass=35 fail=0 exit=0` ✅              |
| **dist 入口**            | 全部通过                       | `tests=35 pass=35 fail=0 exit=0` ✅              |
| **桩替换 46 个目标文件** | **全部失败**（`allFail=true`） | `tests=35 pass=0 fail=35 allFail=true exit=0` ✅ |

**⚠️ 第三段是关键**：它验证「契约测试对实现有真实约束力」。
若桩替换后仍有用例通过，说明该用例只做静态分析（见 `known-differences.md` §4）。

---

## 二、首轮桩下通过数与收敛过程

| 契约包                      | 文件数 | 首轮桩下通过 |       收敛轮次        | 最终             |
| :-------------------------- | :----: | :----------: | :-------------------: | :--------------- |
| `services-02`（纯声明）     |   17   |   22 / 26    | **4 轮**（4→9→20→31） | 31/31 全失败     |
| `services-03`（纯逻辑）     | 16→31  |   16 / 25    | **4 轮**（16→5→4→0）  | 25/25 全失败     |
| **`services-04`（含 I/O）** | **46** | **16 / 35**  |   **1 轮**（16→0）    | **35/35 全失败** |

### 首轮通过的 16 个（全部是「纯静态断言」）

| 类别        | 用例                                         |
| :---------- | :------------------------------------------- |
| 元数据/范围 | B1×2、B2、**B3（导出面逐模块）**、C4、C5、C6 |
| 纯文本扫描  | B4a、B4d、B5a、B6、**B7×2**、B8×2、B10×3     |

**收敛做法**：给 27 处静态断言加 `await ensureLoadable()` 前置
（先证明 46 个模块真实可加载，再比对文本）→ **一轮完成**。

**⚠️ 「一轮」不代表这个问题变简单了** ——
它说明「`ensureLoadable()` 前置」这个模式已从 `services-02`/`03` 的教训中固化，
**可以一次加全**，不再需要「逐轮发现遗漏」。

---

## 三、⚠️ 失败类型分类（本包特有，`failureKinds` 字段）

**`services-04` 有 2 个包级聚合桶（`index.ts` / `node.ts`）不在桩替换范围**，
但它们的转发目标会失效 → 桩替换后可能出现两种失败形态：

| 类型            | 表现                                         |  是否合规   |
| :-------------- | :------------------------------------------- | :---------: |
| **A. 断言失败** | 测试跑完，断言不成立                         |   ✅ 合规   |
| **B. 加载失败** | 模块（或其引用的聚合桶）在 `import` 阶段抛错 | ✅ **合规** |

**为什么 B 也合规**：「聚合桶转发的每个符号必须能从实现文件取到」本身就是契约；
桩替换后加载失败，证明「该契约被破坏」—— 与「实现缺失导致产品启动失败」等价。

### 实测分类结果（`gate-old.json` 的 `failureKinds` 字段）

```powershell
node --import tsx specs/contracts/services-04/tests/classify-failures.mjs
```

```
测试汇总:        { tests: 35, suites: 4, pass: 0, fail: 35 }
分类到的用例:    35   ← 与门禁 fail 完全一致
  B 类 加载失败:  35
  A 类 断言失败:   0
  other:           0

按文件: dependencies 10 / purity 10 / surface 8 / typecheck 7 = 35
```

**⚠️ 「35 个全是加载失败」是本包的一个重要事实**：

**因为 `ensureLoadable()` 是所有静态断言的前置** ——
桩替换后它在**第一个用例就抛错**，测试在 `import` 阶段就终止，
**根本走不到断言逻辑**。

**这意味着**：

- **好的一面**：`allFail` 极其干净（100% 加载失败，无歧义）；
- **需注意的一面**：**它证明的是「模块不可加载」而不是「行为不符」**。
- **所以「行为不符」的防线由什么保证？**
  → 由**真实环境下的 35/35 通过**（源码 + dist 两入口）保证；
  → 桩替换只证明「这些测试确实依赖真实实现」。

**⚠️ 分类脚本的局限（如实记录）**：

```
· 按「每个失败用例的首个错误行」归类；若同时含加载失败与断言失败，按加载失败计。
· 用例名从测试文件提取（test("...")），用于把 node:test 输出的套件名从用例计数中排除。
· 去重键是「用例所在文件 + 标题」——
  因为 `B0 全部 46 个实现文件必须可加载` 在 surface / purity / dependencies 三个文件里同名，
  只用标题去重会丢掉 2 个用例（35 → 33）。
```

---

## 四、两入口等价

```powershell
# 源码入口（默认）
node --import tsx --test --test-concurrency=1 --test-timeout=600000 \
  specs/contracts/services-04/tests/*.test.mjs

# dist 入口
$env:KNORVIA_SVC04_ENTRY="dist"
node --import tsx --test --test-concurrency=1 --test-timeout=600000 \
  specs/contracts/services-04/tests/*.test.mjs
```

**两入口必须都 35/35**。dist 入口前需构建：

```powershell
pnpm --filter "@knorvia/services" exec tsc -b
```

**⚠️ 不能只跑 `tsc --noEmit -p packages/services`** ——
会因项目引用未构建报 `TS6305`。
标准做法是根级 `tsc -b packages/rpc packages/provider packages/provider-node packages/shared packages/services`。

---

## 五、范围与统计冻结

| 项                 |                                                                           冻结值 | 断言 |
| :----------------- | -------------------------------------------------------------------------------: | :--- |
| 实现文件数         |                                                                           **46** | B1   |
| 行数               |                                                                        **5,635** | B1   |
| 字节               |                                                                      **197,458** | B1   |
| 导出               |                                         **145**（运行时 **99** / 纯类型 **46**） | B3   |
| 分类               | `upstream-modified 20` / `unreviewed 18` / `original 6` / `upstream-unchanged 2` | B1   |
| 层内依赖边         |                                                                           **64** | B7   |
| 汇聚点（入度≥2）   |                                                                           **18** | B7   |
| 叶子               |                                                                           **16** | B7   |
| 真 I/O 文件        |                                                                           **14** | B4c  |
| 纯工具文件         |                                                                            **6** | B4c  |
| 模块级副作用       |                                                                         **6** 处 | B5b  |
| `process.env` 文件 |                                                                         **8** 个 | B5c  |
| 外部直接引用       |                                                                        **18** 处 | B10  |
| 经聚合桶使用       |                                                                   **379** 个文件 | B10  |
| 零直接引用模块     |                                                                        **38** 个 | B10  |

---

## 六、`interface.md` 与源码一致

**`interface.md` 是机器生成的**：

```powershell
node --import tsx specs/contracts/services-04/tests/gen-interface.mjs
```

**改任何源码导出后必须重跑**，否则 B3 / C6 会失败。

**其他生成器**：

```powershell
node --import tsx specs/contracts/services-04/tests/gen-scope.mjs     # scope-files.json + .frozen.json
node --import tsx specs/contracts/services-04/tests/gen-callers.mjs   # callers.md + callers-summary.json
node --import tsx specs/contracts/services-04/stubs/build-stubs.mjs   # 46 个桩 + targets.txt
node --import tsx specs/contracts/services-04/tests/classify-failures.mjs  # failureKinds
```

---

## 七、provenance（提交前，**必须 0**）

**按 #261/#265 确立的规范**：必须在**纯净工作树**（`git status` 空）里跑。

```powershell
git worktree add wt/svc04-clean --detach <HEAD>
cd wt/svc04-clean
pnpm fmt && pnpm provenance:report && pnpm provenance:check   # check 看退出码 0
```

### 已知的两个陷阱

**① `provenance:report` 会把磁盘上实际存在的文件算进 inventory**（含未提交改动）
→ **必须在干净树跑**（源码：`scripts/provenance/git.mjs:73` 的 `--cached` + `--others`）。

**② `licensing/current-files.json` 记录了 `reviews.json` 自己的 sha**
→ 改了 reviews.json 后必须**最后**重新生成 current-files。

### 自引用检查

```powershell
node -e "const fs=require('fs'),c=require('crypto');
const cf=JSON.parse(fs.readFileSync('licensing/current-files.json','utf8'));
const e=cf.files.find(f=>f.path==='licensing/reviews.json');
const a=c.createHash('sha256').update(fs.readFileSync('licensing/reviews.json')).digest('hex');
console.log('自引用一致:', e.sha256===a);"
```

### 解 licensing 冲突的正确顺序（不要用整体替换！）

```
merge main → git checkout --theirs licensing/current-files.json
→ pnpm provenance:report → pnpm fmt → pnpm provenance:report → pnpm provenance:check → commit
```

**⚠️ 不要用 `git checkout origin/main -- licensing/*.json`** ——
会把本分支的登记抹掉。

---

## 八、提 PR 前

```powershell
pnpm verify:pre-push    # #277 的增量校验（695ms），本地拦住「登记过期」
```

---

## 九、验收检查清单

- [ ] 源码入口 **35/35**
- [ ] dist 入口 **35/35**
- [ ] 桩替换 **35/35 全部失败**（`allFail=true`）
- [ ] **`failureKinds` 字段已生成**（35 个用例全分类，无 `other`）
- [ ] 纯净树 `provenance:check` 退出码 0
- [ ] 自引用检查一致
- [ ] `fmt:check` 通过
- [ ] `interface.md` 与源码导出面一致（B3 + C6 双路）
- [ ] 「首轮桩下通过数」记录在 PR body（16/35 → 一行收敛）
- [ ] `known-differences.md` 的 K-v / K-w / K-x / K-y / K-z 已逐条核对
- [ ] `pnpm verify:pre-push` 通过
