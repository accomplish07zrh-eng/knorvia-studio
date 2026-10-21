# services-03 合同（`studio-runtime/domain` 纯逻辑层）

## 这是什么

`packages/services/src/studio-runtime/domain/` 下 **31 个文件**的**契约冻结**：
模块路径、导出签名、纯逻辑层不变量、依赖方向。

它被 `app/`（71 处）与 `adapters/`（61 处）向下依赖，
自身**只依赖 `services-02` 的契约声明**（且只有 `import type` 的反向引用，见 K6）。

## 快速开始

```powershell
# 1. 跑契约测试（源码入口）
node --import tsx --test --test-concurrency=1 --test-timeout=600000 \
  specs/contracts/services-03/tests/*.test.mjs

# 2. 跑旧门三段（源码 + dist + 桩替换）
node scripts/contract-gate.mjs --contract "specs/contracts/services-03" --tests "*.test.mjs" `
  --dist-env "KNORVIA_SVC03_ENTRY=dist" `
  --stub-targets "specs/contracts/services-03/stubs/targets.txt" `
  --stub-root "specs/contracts/services-03/stubs" `
  --json "specs/contracts/services-03/gate-old.json"

# 3. 重新生成 interface.md（改源码导出后必须重跑）
node --import tsx specs/contracts/services-03/tests/gen-interface.mjs

# 4. 重新生成桩（改 scope 后必须重跑）
node --import tsx specs/contracts/services-03/stubs/build-stubs.mjs
```

## 文件导航

| 文件 | 用途 |
| :--- | :--- |
| **`interface.md`** | 17→31 个模块的导出签名（**机器生成，不要手改**） |
| **`behavior.md`** | B1–B15 行为规格 + 条目 → 测试对照表 |
| **`known-differences.md`** | K1–K8 已知差异 + **桩下失效的完整技术复盘** |
| **`acceptance.md`** | 验收判据（旧门三段 + 两入口 + 桩 `allFail`） |
| **`design.md`** | 替换阶段的分工与顺序 |
| **`callers.md`** | 176 处外部引用清单 |
| `scope-files.json` | 31 个文件的冻结快照（行数/字节/导出数/分类） |
| `gate-old.json` | 旧门三段实测结果 |

## 测试构成（4 套件 / 25 用例）

| 套件 | 用例 | 覆盖 | 文件 |
| :--- | :-: | :--- | :--- |
| surface | 6 | 范围清单 · 功能簇 · 导出面 · 端口 3 模块 | `tests/surface.test.mjs` |
| purity | 7 | 无 I/O · 无 env · 无子进程 · 无顶层 let/var · 两模块非死代码 | `tests/purity.test.mjs` |
| dependencies | 7 | 不向上依赖 · 层内 21 条边 · 176 处外部引用 · import type 边界 | `tests/dependencies.test.mjs` |
| typecheck | 5 | **桩检测** · tsc 项目引用构建 · 31 个 `.d.ts` · 统计自洽 | `tests/typecheck.test.mjs` |

## ⚠️ 本包最重要的教训

**契约包的静态断言会让旧门的 `allFail` 防线失效**：
首轮桩替换后仍有 **16/25 个用例通过**（因为桩的导出名由 AST 生成，与真实源码文本一致）。

**修法**：`tests/load-guard.mjs` 的 `ensureLoadable()` —— 每条静态断言前先证明模块能真实加载。
收敛过程：**16 → 5 → 4 → 0**（四轮，每轮真实失败，没有放宽断言）。

详见 `known-differences.md` §4。

## 边界

- **不含** `app/`（45 件）：归 `services-04`～`services-06`；
- **不含** `adapters/`（60 件）：归 `services-07`/`08`；
- **不含** `contract.ts` 的聚合职责：已在 `services-02`（#265）。

## 相关

- `specs/knorvia-independent-implementation.md` —— 独立替换总纲
- `specs/contracts/services-02/` —— 上一包（契约声明与端口），已合并
- `lead/svc03-recon-20261021.md` —— 侦察稿（**含 3 处数据错误，见 K2**）
