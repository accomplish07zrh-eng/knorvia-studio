# services-03 验收判据

## 一、旧门三段（必须全部通过）

```powershell
node scripts/contract-gate.mjs --contract "specs/contracts/services-03" --tests "*.test.mjs" `
  --dist-env "KNORVIA_SVC03_ENTRY=dist" `
  --stub-targets "specs/contracts/services-03/stubs/targets.txt" `
  --stub-root "specs/contracts/services-03/stubs" `
  --json "specs/contracts/services-03/gate-old.json"
```

| 段                       | 判据                           | 实测                                             |
| :----------------------- | :----------------------------- | :----------------------------------------------- |
| **源码入口**             | 全部通过                       | `tests=25 pass=25 fail=0 exit=0` ✅              |
| **dist 入口**            | 全部通过                       | `tests=25 pass=25 fail=0 exit=0` ✅              |
| **桩替换 31 个目标文件** | **全部失败**（`allFail=true`） | `tests=25 pass=0 fail=25 allFail=true exit=0` ✅ |

**⚠️ 第三段是关键**：它验证「契约测试对实现有真实约束力」。
若桩替换后仍有用例通过，说明该用例只做静态分析（见 `known-differences.md` §4）。

## 二、本包的「首轮桩下通过数」记录（验收时必须报告）

| 轮次        | 桩下通过 / 总 | 改动                                                              | 提交前须为 0 |
| :---------- | :-----------: | :---------------------------------------------------------------- | :----------: |
| 首次        |    16 / 25    | （基线）                                                          |      ❌      |
| 第 2 轮     |    5 / 24     | 加 `B0` 全模块可加载前置                                          |      ❌      |
| 第 3 轮     |    4 / 25     | purity/dependencies/surface 接 `ensureLoadable()`；加 `C0` 桩检测 |      ❌      |
| **第 4 轮** |  **0 / 25**   | C1–C4 也接 `ensureLoadable()`                                     |      ✅      |

**后续契约包请沿用这个表格** —— 「首轮桩下通过数」是衡量合同质量的直接指标。

## 三、两入口等价

```powershell
# 源码入口（默认）
node --import tsx --test --test-concurrency=1 --test-timeout=600000 \
  specs/contracts/services-03/tests/*.test.mjs

# dist 入口
$env:KNORVIA_SVC03_ENTRY="dist"
node --import tsx --test --test-concurrency=1 --test-timeout=600000 \
  specs/contracts/services-03/tests/*.test.mjs
```

**两入口必须都 25/25**。dist 入口前需构建：

```powershell
pnpm --filter "@knorvia/services" exec tsc -b
```

**⚠️ 不能只跑 `tsc --noEmit -p packages/services`** ——
会因项目引用未构建报 `TS6305`（那不是签名错误，是构建顺序问题）。
标准做法是根级 `tsc -b packages/rpc packages/provider packages/provider-node packages/shared packages/services`。

## 四、范围与统计冻结

| 项         |                                             冻结值 | 断言 |
| :--------- | -------------------------------------------------: | :--- |
| 文件数     |                                             **31** | B1   |
| 行数       |                                          **3,835** | B1   |
| 字节       |                                        **154,293** | B1   |
| 导出       |          **192**（运行时 **161** / 纯类型 **31**） | B3   |
| 分类       |                    `original 17` / `unreviewed 14` | B1   |
| 层内依赖边 |                                             **21** | B9   |
| 外部引用   | **176**（app 71 / adapters 61 / test 35 / root 9） | B10  |

## 五、`interface.md` 与源码一致

**`interface.md` 是机器生成的**：

```powershell
node --import tsx specs/contracts/services-03/tests/gen-interface.mjs
```

**改任何源码导出后必须重跑**，否则 B3 会失败（导出面比对）。

## 六、provenance（提交前）

**按 `#261`/`#265` 确立的规范**：必须在**纯净工作树**（`git status` 空）里跑。

```powershell
git worktree add wt/svc03-clean --detach <HEAD>
cd wt/svc03-clean
pnpm fmt && pnpm provenance:report && pnpm provenance:check   # check 看退出码 0

# 自引用检查（关键）
node -e "const fs=require('fs'),c=require('crypto');
const cf=JSON.parse(fs.readFileSync('licensing/current-files.json','utf8'));
const e=cf.files.find(f=>f.path==='licensing/reviews.json');
const a=c.createHash('sha256').update(fs.readFileSync('licensing/reviews.json')).digest('hex');
console.log('自引用一致:', e.sha256===a);"
```

**⚠️ 两个已知陷阱**：

1. `provenance:report` 会把**磁盘上实际存在的文件**算进 inventory（含未提交改动）→ 必须在干净树跑；
2. `licensing/current-files.json` 记录了 `reviews.json` **自己的 sha** → 改了 reviews.json 后必须最后重新生成。

## 七、验收检查清单

- [ ] 源码入口 25/25
- [ ] dist 入口 25/25
- [ ] 桩替换 **25/25 全部失败**（`allFail=true`）
- [ ] 纯净树 `provenance:check` 退出码 0
- [ ] 自引用检查一致
- [ ] `fmt:check` 通过
- [ ] `interface.md` 与源码导出面一致（B3）
- [ ] 「首轮桩下通过数」记录在 PR body
- [ ] `known-differences.md` 的 K1–K8 已逐条核对
