# kernel-plugin-rewind 验收记录（acceptance.md）

**合同版本：v1**（2026-10-22）

---

## 1. 范围与文件数

| 目录                                                                   | 全部文件 |                                      本包归属 |
| ---------------------------------------------------------------------- | -------: | --------------------------------------------: |
| `apps/cli/packages/core/src/runtime/methods`（旧实现中的 rewind 相关） |        9 | **9**（全部返工，随 `core` 删除后由本包承接） |
| `apps/cli/packages/bootstrap/src/kernel-plugin-rewind`（新建）         |       11 |                                        **11** |

**⚠️ 本包不修改任何既有文件**：只新增 `bootstrap/src/kernel-plugin-rewind/**`、
`specs/contracts/kernel-plugin-rewind/**`、以及 `licensing/reviews.json` 的登记。

### 1.1 旧实现的处置

旧 9 个文件的 `classification`（来自 `licensing/current-files.json`）：

| 文件                                  | classification      | `review` |
| ------------------------------------- | ------------------- | -------- |
| `rewind.ts`                           | `upstream-modified` | `null`   |
| `workspace-checkpoints.ts`            | `upstream-modified` | `null`   |
| `file-rewind-planning.ts`             | `unreviewed`        | `null`   |
| `rewind-conversation-state.ts`        | `unreviewed`        | `null`   |
| `workspace-checkpoint-persistence.ts` | `upstream-modified` | `null`   |
| `rewind-workspace-cascade.ts`         | `unreviewed`        | `null`   |
| `file-rewind.ts`                      | `upstream-modified` | `null`   |
| `rewind-message.ts`                   | `upstream-modified` | `null`   |
| `file-rewind-storage.ts`              | `unreviewed`        | `null`   |

**⚠️ 5 个 `upstream-modified` + 4 个 `unreviewed`，`review` 全为 `null`** ——
即「有 inventory 分类、但从未建立 review 条目」。

**处理**：**按「返工」处理**（不是新写），理由：

- `upstream-modified` = 继承自 ZCode 且已有本地改动 → 必须替换；
- `unreviewed` = 未审查 → 按「可能继承」处理；
- 两者都不是 `original`。

**基线**：`--old <同路径> --old-rev beff12b5`（当前 main 版本即「重写前」状态）。

**⚠️ 这 9 个文件在 `reviews.json` 里的缺失是 licensing 的一个已知不完整形态** ——
本包实现阶段要**补登记**（新文件登记 `original`；旧文件的缺失条目另行报告，不在本包修）。

---

## 2. 计分模式标注（计划书 L580 ①）

| 文件                                             | 计分模式 | 说明                      |
| ------------------------------------------------ | -------- | ------------------------- |
| `kernel-plugin-rewind/index.ts`                  | 普通     | 有 `apply` 实现           |
| `kernel-plugin-rewind/file-rewind-plan.ts`       | 普通     | 有逻辑（计划计算）        |
| `kernel-plugin-rewind/file-rewind-apply.ts`      | 普通     | 有逻辑（执行 + journal）  |
| `kernel-plugin-rewind/file-rewind-compensate.ts` | 普通     | 有逻辑（补偿）            |
| `kernel-plugin-rewind/file-state.ts`             | 普通     | 有逻辑（状态读取 + hash） |
| `kernel-plugin-rewind/checkpoint-events.ts`      | 普通     | 有逻辑（事件读写）        |
| `kernel-plugin-rewind/checkpoint-list.ts`        | 普通     | 有逻辑（列表/预览）       |
| `kernel-plugin-rewind/conversation-plan.ts`      | 普通     | 有逻辑（目标计算）        |
| `kernel-plugin-rewind/rewind-router.ts`          | 普通     | 有逻辑（分派）            |
| `kernel-plugin-rewind/tool-declarations.ts`      | 普通     | 有数据 + 少量逻辑         |
| `kernel-plugin-rewind/logger.ts`                 | 普通     | 极简（接口 + NOOP）       |

**⚠️ 本包无纯声明文件** → **统一走普通模式**，不使用 `--declaration` / `--contract-lines`。

---

## 3. 相似度门禁

### 3.1 新代码的登记

本包 11 个文件**全部新写** → 登记 **`original`**。

### 3.2 相似度实测（双口径，但不适用旧文件侧）

```bash
# 仓库根；对每个新文件
node scripts/provenance/similarity.mjs \
  --candidate apps/cli/packages/bootstrap/src/kernel-plugin-rewind/<file>.ts \
  --old       apps/cli/packages/bootstrap/src/kernel-plugin-rewind/<file>.ts \
  --old-rev   beff12b5 \
  --upstream-dir "$KNORVIA_UPSTREAM_DIR" \
  --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521
```

**⚠️ 预期**：`beff12b5` 里**不存在**这些新文件 → 工具报
`--old path(s) not found in beff12b5` 并**拒绝静默退化**（`#256` 的修复生效）。
按接入包规则改用 `--allow-upstream-only` 测上游侧。

**⚠️ 而这一步的结果只证明「新文件与其上游对应物不雷同」**，
**不证明「本包是独立实现」** —— 独立性由「本包是全新结构（端口注入 + 11 文件拆分）」保证。

### 3.3 旧实现的相似度（这 9 个文件本身）

**⚠️ 本包不改旧文件**，但**要在验收文档里记录它们的实测值**（因为它们是「待替换对象」）：

```bash
# 对旧 9 个文件逐一
node scripts/provenance/similarity.mjs \
  --candidate apps/cli/packages/core/src/runtime/methods/<file>.ts \
  --old       apps/cli/packages/core/src/runtime/methods/<file>.ts \
  --old-rev   beff12b5 \
  --upstream-dir "$KNORVIA_UPSTREAM_DIR" \
  --upstream-rev 872ad960...
```

**预期**：旧文件侧 `1.000`（自 `beff12b5` 以来未改动）、上游侧为继承代码的高相似度。
**结论**：**旧实现全部超标，必须被本包替代** —— 这正是本包存在的理由。

---

## 4. 门禁（计划书「接入包流程」）

### 4.1 旧门（默认引擎）

```bash
node specs/contracts/kernel-plugin-rewind/tests/run-gate.mjs
```

**判据**：默认引擎下**不加载**本包（`run.ts:255` 的分流保证），
且旧 `core` 行为不变（旧门只跑本包的离线用例）。

### 4.2 新运行时门（`KNORVIA_KERNEL_ENGINE=dsh`）

```bash
node specs/contracts/kernel-plugin-rewind/tests/run-gate.mjs --engine dsh
```

**用例清单**（对应 behavior.md 的断言）：

| B   | 用例数 | 覆盖点                                                                                               |
| --- | -----: | ---------------------------------------------------------------------------------------------------- |
| B1  |      4 | 缺 `fileSystem` / 缺 `eventStore` / 缺 `workspaceRoot` / 源码无 `node:fs` 与 `KNORVIA_KERNEL_ENGINE` |
| B2  |      5 | 无检查点 / 内容相同 / 文件被删 / 文件新增 / **preview 零写入**                                       |
| B3  |      5 | 正常回退 / 漂移拒绝 / 端口抛错触发补偿 / 重复 apply / 并发 apply                                     |
| B4  |      3 | 第 2 步失败回滚第 1 步 / 补偿也失败 / 只补偿已执行步骤                                               |
| B5  |      2 | 计划 5 步失败于第 2 步 / 计划外路径零触碰                                                            |
| B6  |      3 | 内容不变 / 内容变了拒绝 / 文件删除不算漂移                                                           |
| B7  |      4 | 可回退返回 seq / 不可回退 available:false / **源码无 fork 调用** / 结果不含「已执行」标识            |
| B8  |      4 | append 一次 / 列表零 append / append 抛错 / 无内部缓存                                               |
| B9  |      3 | 端口抛错 → 失败 / 目标不存在 → available:false / 不存在无 reason 的空成功                            |
| B10 |      3 | 重复 apply no-op / 并发第二个失败 / finally 清理                                                     |
| B11 |      3 | win32 与 posix 路径 / 源码无 `node:path` 直用 / 无硬编码分隔符                                       |
| B12 |      4 | 声明 `destructive` / `sideEffectScope` / `needsApproval` / preview 工具为只读                        |

**合计 43 个用例。**

### 4.3 产物

| 门         | 产物               | 目标     |
| ---------- | ------------------ | -------- |
| 旧门       | `gate-legacy.json` | 全部通过 |
| 新运行时门 | `gate-dsh.json`    | 全部通过 |

**产物字段**（同 `kernel-plugin-policy`）：`contract` / `contractVersion` / `engine` /
`scope` / `testFile` / `commit` / `ranAt` / `node` / `totals` / `verdict`。

**⚠️ `scope` 字段要写明「本门只覆盖离线逻辑，不含真实文件系统与真实 fork」**。

**接入包无 stubs。**

---

## 5. 端口替身（测试基础设施）

**⚠️ 本包的测试全靠两个替身**，不碰真实磁盘与数据库：

| 端口                    | 替身                 | 能力                                                                                   |
| ----------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `FileSystemPort`        | `InMemoryFileSystem` | 内存目录树；可注入「第 N 次 write 抛错」以测补偿；记录所有调用（断言零写入、路径集合） |
| `SessionEventStorePort` | `InMemoryEventStore` | 内存事件数组；`append` 递增 seq；可注入抛错                                            |

**⚠️ 替身必须与端口契约一致**（尤其 `SessionEventStorePort` 的「按会话追加顺序可回放」）——
否则测试通过但真实实现失败。

**验收要求**：替身实现的注释里引用端口定义位置，并说明「本替身覆盖哪些契约、不覆盖哪些」。

---

## 6. 验收清单

### 6.1 必过项

- [ ] 11 个实现文件全部新增，无既有文件改动
- [ ] `pnpm typecheck` 通过（全仓，且先 `build:cli-packages`）
- [ ] `pnpm lint` 0 error
- [ ] `pnpm fmt:check` 通过
- [ ] `pnpm architecture:check` 通过（new 违规 0）
- [ ] 旧门 `gate-legacy.json` 全部通过
- [ ] 新运行时门 `gate-dsh.json` 全部通过（43 用例）
- [ ] `provenance:report` → `reviewProblems 0`
- [ ] `provenance:check` → 退出码 0
- [ ] `licensing/reviews.json` 登记 11 个新文件为 `original`
- [ ] 双平台 CI 全绿

### 6.2 数据契约兼容（K3 / K8，两个高危项）

#### K3 `contentHash` 三条边界必须全断言

```ts
// ① null → 字面量 "missing"（不是 sha256("")、不是空串）
assert.equal(contentHash(null), "missing");

// ② 空字符串 ≠ null（这是最容易被混淆的边界）
assert.equal(contentHash(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

// ③ 普通内容的已知定值
assert.equal(
  contentHash("abc"),
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
);
```

**⚠️ 只测 ③ 会漏掉最危险的情形**：
若新实现把 `null` 也送去 hash → 得到 `sha256("")` 而不是 `"missing"`
→ **所有「文件已删除」的检查点比对都会失败**。

- [ ] `contentHash(null) === "missing"`
- [ ] `contentHash("") === sha256("")`（与 `null` 严格区分）
- [ ] `contentHash("abc")` 等于已知定值
- [ ] 读取文件内容时**显式传 UTF-8**（不依赖 `FileSystemPort` 默认编码）
- [ ] `contentHash` 允许直接 `import { createHash } from "node:crypto"`
      （AGENTS.md 禁止清单是 `fetch`/`http`/`fs`/`child_process`/`process.env`，**不含 crypto**）

#### K8 事件类型与 payload 兼容

- [ ] 四类标识逐字匹配：`CheckpointCreated` / `RewindTriggered` /
      `SESSION_ENTRY_WORKSPACE_CHECKPOINT` / `SESSION_ENTRY_WORKSPACE_FILE_REWIND`
- [ ] **不合格的历史事件返回 `null`（跳过），不抛错** ——
      与旧实现的可观测行为一致（若改成抛错，一条脏数据会让整个列表失败）

#### 样本来源与复制要求

**6 个夹具共 31 个 sha256 样本**（`core/test/` 下）：

| 夹具                                                   |        大小 | sha256 样本数 |
| ------------------------------------------------------ | ----------: | ------------: |
| `runtime-file-rewind-baseline-20261003.json`           | 42,958 字节 |             3 |
| `runtime-file-rewind-boundary-proof-20261003.mjs`      |  7,252 字节 |             5 |
| `runtime-rewind-baseline-20261003.json`                | 80,822 字节 |             6 |
| `runtime-rewind-current-20261003.json`                 |  1,431 字节 |            12 |
| `runtime-rewind-safety-20261003.test.mjs`              |  2,815 字节 |             2 |
| `runtime-workspace-checkpoints-baseline-20261003.json` | 24,873 字节 |             3 |

**⚠️ 这些夹具会随 `core` 删除** → 本包必须**复制副本**到
`bootstrap/test/fixtures/kernel-plugin-rewind/`（不是引用），并在副本 README 注明：

```
样本来源：apps/cli/packages/core/test/<file>（已随 core 删除，本包保留副本）
用途：K3 / K8 的数据契约兼容断言
```

**⚠️ 而「`"missing"` 字面量在 6 个夹具里零出现」** ——
说明现有夹具**不覆盖「文件不存在」场景**，
所以 K3 的 `null → "missing"` 断言必须靠**定值断言**（见上面 ①），不能只靠夹具。

**⚠️ 这两项不能只靠「代码看起来对」** —— 必须用**旧实现产出的真实样本**做断言。

### 6.3 装配期不变量（组合根负责，本包断言）

- [ ] `fileSystem` / `eventStore` / `workspaceRoot` 三者都注入
- [ ] `workspaceRoot` 是该 session 的 `workspacePath`（K2）
- [ ] 本包注册的工具声明被 `kernel-plugin-policy` 读到（否则 riskLevel 落到 medium）

### 6.4 未覆盖（归 `kernel-switch`）

- **真实文件系统**上的跨平台路径行为（Windows 盘符 / 大小写 / 路径长度 / 软链）
- **真实 `SessionEventStorePort` 实现**的持久化（内存 / SQLite / DSH 适配）
- **真实 `session.fork` 端到端**（本包只产出 `targetSequenceNumber`）
- **旧会话库里的历史检查点展示**（归 `kernel-legacy-sessions`，规格 L100）
- **实机冒烟**：真机回退一次真实工作区

---

## 7. 已知风险

|  #  | 风险                                                   | 缓解                                                                  |
| :-: | ------------------------------------------------------ | --------------------------------------------------------------------- |
| R1  | **`contentHash` 算法不一致** → 旧检查点被误判漂移      | 验收 6.2 用旧样本断言（K3）                                           |
| R2  | **事件 payload 不兼容** → 读不到旧检查点               | 验收 6.2 用旧样本断言（K8）                                           |
| R3  | 端口替身与真实实现行为不一致 → 测试通过但生产失败      | 替身注释引用端口契约；真实实现在 `kernel-switch` 冒烟                 |
| R4  | 组合根忘注入 `workspaceRoot` → 启动失败                | 装配期抛错（早失败，B1）；写进 §九 接缝                               |
| R5  | 工具声明未被子包读到 → riskLevel 偏低、高风险不弹窗    | 验收 6.3；B12 断言声明内容                                            |
| R6  | 补偿逻辑复杂，易漏边界（如 `create-directory` 的补偿） | B4/B5 三个用例覆盖；`create-directory` 补偿失败可容忍（不算补偿失败） |
