# services-02 合同（`studio-runtime` 契约层 · 17 件）

**合同版本：v1**

本目录是 `services-02`（认领 issue：**#243**）的**兼容合同**：先冻结公开行为与导出签名，再按内部功能模块组织独立重写。

- 分支：`contract/services-02`；工作树：`wt/exec-m3-svc02`
- 依据：《Knorvia 独立替换任务计划书》、`specs/knorvia-internal-plugins.md` 服务层功能模块规范
- 上位分析：`lead/sr-analysis-20261020.md`（`studio-runtime` 149 文件的 7 包切法）

---

## 一、选包实测

### 1. 范围与度量（2026-10-21）

依据 `licensing/current-files.json` 实测，本包 **17 个文件**（13 unreviewed + 4 original），1,590 行 / 55,151 字节：

| 角色                       | 文件数 | 说明                                                      |
| -------------------------- | :----: | --------------------------------------------------------- |
| 纯类型/契约声明            | **10** | 包内其余 6 包的地基                                       |
| **端口（从 `app/` 下沉）** | **4**  | `ports`、`storePort`、`imagePort`、`workspaceRuntimePort` |
| 示例                       |   1    | `contract.example.ts`                                     |
| 入口                       |   2    | `module.ts`、`node.ts`                                    |
| **合计**                   | **17** |                                                           |

详细列表与度量冻结于 [`scope-files.json`](scope-files.json)。

### 2. 为什么端口下沉到本包

`studio-runtime` 依赖分析实测（`lead/sr-deps.json`）：

- `adapters` 层有 **7 处** `adapters → app` 依赖，**全部指向 4 个端口文件**；
- 这是 Ports & Adapters：`adapters` 在**实现** `app` 声明的端口；
- 端口是**纯接口声明**，语义属契约层；
- **下沉后 `adapters → app` 归零**，依赖完全单向：`contracts ← domain ← app-* ← adapters-*`。

### 3. 端口下沉的影响面（实测）

4 个端口文件共 **94 处引用，全部在 `packages/services/` 内，包外 0 次**（扫描 `packages/**` + `apps/**` 的 `.ts/.tsx/.mts/.cts`）：

| 端口文件                      | 引用数 | services 包内 | 包外  |
| ----------------------------- | :----: | :-----------: | :---: |
| `app/ports.ts`                |   29   |      29       | **0** |
| `app/storePort.ts`            |   55   |      55       | **0** |
| `app/imagePort.ts`            |   5    |       5       | **0** |
| `app/workspaceRuntimePort.ts` |   5    |       5       | **0** |
| **合计**                      | **94** |    **94**     | **0** |

> **口径说明**：先前只统计了「`studio-runtime` 之外的引用」得 31 处；**含 `studio-runtime` 内部引用的总数是 94 处**。此处按 94 处记录，避免后续包低估成本。

引用者构成（以 `ports.ts` 为例）：`adapters/` 3 处、`app/` 21 处、`packages/services/test/` 5 处。

**结论**：下沉只改 services 包内的 import 路径，不波及 `packages/desktop`、`packages/server`、`apps/**`。

---

## 二、兼容面（公开入口）

本包的公开面由两层构成：

1. **包级导出面**（`interface.md` 逐条列名）：10 个声明文件的顶层导出 + 4 个端口的接口形状 + 2 个入口的装配函数；
2. **模块路径**（必须可用）：`studio-runtime/` 根级 12 个模块路径 + 下沉后的 4 个端口路径。

替换阶段的硬要求：**这些模块路径与导出名在编译产物中保持可用**，签名不变。

---

## 三、完成度

| 交付项       | 状态 | 说明                                                    |
| ------------ | :--: | ------------------------------------------------------- |
| 范围清单     |  ✅  | [`scope-files.json`](scope-files.json) 实测冻结 17 文件 |
| 接口冻结     |  ✅  | [`interface.md`](interface.md)                          |
| 调用方分析   |  ✅  | [`callers.md`](callers.md)                              |
| 行为规格     |  ✅  | [`behavior.md`](behavior.md)                            |
| 目标架构     |  ✅  | [`design.md`](design.md)                                |
| 黑盒测试     |  ✅  | [`tests/`](tests/)                                      |
| 合同桩与旧门 |  ✅  | [`gate-old.json`](gate-old.json)                        |
| 验收报告     |  ✅  | [`acceptance.md`](acceptance.md)                        |
| 已知差异     |  ✅  | [`known-differences.md`](known-differences.md)          |

---

## 四、契约包的测试设计

本包是**契约包**（纯类型 + 端口），行为面很窄。测试的四类断言：

1. **导出面双向断言**：`interface.md` 列出的每个导出都存在，且**没有多余导出**；
2. **类型自洽断言**：`contract.example.ts` 能编译（等价于契约自洽的编译期检查）；
3. **端口签名断言**：4 个端口的形状与 `interface.md` 一致；
4. **依赖方向断言**（下沉后的关键不变量）：**`studio-runtime` 契约层的文件不得 import `app/`、`adapters/`、`domain/`** —— 这条扫源码执行，作为门禁。

第 4 条是端口下沉的结构保证：只要它绿，依赖就永远是单向的。

---

## 五、不做什么

- **不动 `app/` 其余 41 个文件**（归 `services-04`/`05`/`06`）；
- **不动 `adapters/`**（归 `services-07`/`08`）；
- **不动 `domain/`**（归 `services-03`）；
- 端口下沉**只改位置与 import 路径，不改任何接口签名、不改任何测试断言**。
