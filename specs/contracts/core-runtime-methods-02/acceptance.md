# core-runtime-methods-02 验收（合同阶段）

## 范围

- 24 个继承文件（`apps/cli/packages/core/src/runtime/methods/**`）：分类 **upstream-modified 9 /
  unreviewed 6 / upstream-unchanged 9**（`scope-files.json`）；
- 切片 = turn-model-step-\* 种子 + 依赖闭包（排除 methods-01 已替换面）；
- 口径备注：Lead 口径「turn-model-step-\* 8 件」与实测 **7 件**（纯前缀 6 件 + turn-model.ts）
  有出入，按实测定案。

## 交付

| 件                                                            | 状态                |
| ------------------------------------------------------------- | ------------------- |
| `behavior.md`（B32–B52 + S1–S5 + 常量对照）                   | 已发布              |
| `interface.md` / `callers.md` / `scope-files.json`            | 机器生成 + 口径清正 |
| `tests/`（三文件 + surface + entry.mjs）/ `fixtures/`（金样） | 见 PR 检查输出      |
| `stubs/`（24 桩）/ `gate-old.json`                            | 见 PR 检查输出      |

## 旧门（三跑；PR 自查评论贴实际输出）

| 门                   | 预期   | 实际       |
| -------------------- | ------ | ---------- |
| 契约测试 × 源码入口  | 全过   | 见 PR 自查 |
| 契约测试 × dist 入口 | 全过   | 见 PR 自查 |
| 24 桩替换            | 全失败 | 见 PR 自查 |

## 覆盖与未覆盖

- **覆盖**：B32–B52 九项行为面、S1–S5 事件序列（gate 握手、无 sleep）、语义常量逐字、
  金样两组（模型步往返 / rewind 成功载荷——旧实现真值）、KD-2 观察面（B34）、KD-1 两面收口。
- **未覆盖**：`compactActiveConversation` 内部实现（runtime 方法，属其他包）、工具执行器内部、
  provider 适配细节；`estimateMessageTokens`/`shouldAutoCompact` 等 deps 判定函数的行为（其合同
  归属共享合同，本包只锁调用参数与分支）。

## KD 保留

见 [`known-differences.md`](known-differences.md)：KD-1（rewind 成功载荷金样收口）、
KD-2（观察面收口引 B34）、KD-3（token override 历史归一化边界）。
