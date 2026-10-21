# services-02 行为规格（`studio-runtime` 契约层）

本包是**契约包**：17 个文件里，10 个是纯类型/契约声明、4 个是端口接口、2 个是入口装配、1 个是用法示例。
因此本包的「行为」主要由**导出面稳定性**、**类型自洽**、**端口签名**与**依赖方向**四类不变量构成，
而不是运行时时序。

约定：每条 B 都对应一个可执行断言（见 §对照表）。**导出面与端口签名的 oracle 是 `interface.md`。**

---

## 一、导出面（B1–B6）

### B1 范围清单

17 个文件、角色分布 `declaration 10 / port 4 / entry 2 / example 1`、分类分布 `unreviewed 13 / original 4`
与 `scope-files.json` 冻结值一致。

### B2 导出面双向一致

`interface.md` 每个模块小节的声明名集合，必须与源码 AST 抽出的顶层导出一致（**双向**：不缺、不多）。
这条把 `interface.md` 变成可执行的 oracle，避免它退化成过时文档。

### B3 导出总数守恒

17 个模块合计 **164 项导出**，其中**运行时 72 项 / 纯类型 92 项**。

### B4 声明文件的运行时导出受限

10 个声明文件里，只有 `contract.ts`（29 运行时）、`workflowTypes.ts`（5 运行时）、`kernelTypes.ts`（2 运行时）、`imageTypes.ts`（1 运行时）
有运行时导出；其余 6 个声明文件**必须零运行时导出**（纯类型，编译后不产生 JS 值）。

> 理由：声明文件被其余 6 个包共同引用，一旦混入运行时导出，会把纯类型依赖变成运行期依赖，直接破坏分层。

### B5 入口形状

`module.ts` 导出 1 项（运行时）、`node.ts` 导出 3 项（运行时 2 / 纯类型 1）。两个入口的模块路径在编译产物中必须可用。

### B6 示例不属于公开 API

`contract.example.ts` 的 9 项导出全部是示例常量/构造函数，**不得**被 `interface.md` 之外的任何地方当作公开入口引用。

---

## 二、端口（B7–B12）

### B7 端口签名不变

4 个端口的导出名与签名必须与 `interface.md` 一致：
`imagePort`（2 项）、`ports`（8 项）、`storePort`（7 项）、`workspaceRuntimePort`（3 项）。

### B8 端口下沉后的路径

4 个端口的**新路径**（`studio-runtime/{name}.ts`）是兼容面；**旧路径**（`studio-runtime/app/{name}.ts`）在替换阶段保留 re-export 壳。

> 理由：94 处存量引用不宜一次性迁移；壳让迁移可分批，且壳本身零逻辑（只转发导出）。

### B9 端口文件不含运行期状态

4 个端口共 20 项导出里，运行时导出仅 `imagePort` 的 1 项（`validateStudioTurnImages`，纯函数）。
**端口文件不得持有模块级可变状态**（无 `let`、无可变对象导出）——它们是接口声明，不是实现。

### B10 端口引用面守恒

4 个端口合计 **94 处引用**，全部在 `packages/services/` 内（包外 0 次）：
`ports` 29、`storePort` 55、`imagePort` 5、`workspaceRuntimePort` 5。
下沉后这个数字应保持不变（只是路径变了），**任何减少都说明有引用被误删**。

---

## 三、依赖方向（B11–B13）

### B11 契约层不得反向依赖

`studio-runtime` 契约层（本包 17 个文件）**不得 import `app/`、`adapters/`、`domain/` 下的任何模块**。
这条是端口下沉后的关键不变量：它保证 `contracts` 永远是依赖链的最底层。

### B12 端口下沉消除了 `adapters → app`

下沉前 `adapters` 层有 7 处 `adapters → app` 依赖（全部指向 4 个端口文件）；
下沉后这 7 处变为 `adapters → contracts`，**`adapters → app` 归零**。

### B13 层间依赖仍单向

下沉后层间矩阵里 `app → adapters`、`domain → app`、`domain → adapters` 仍全部为 0
（下沉前实测：这三项都是 0；下沉只影响 `adapters → app` 那 7 处）。

---

## 四、类型自洽（B14–B16）

### B14 示例可编译

`contract.example.ts` 引用了 `contract.ts`、`kernelTypes.ts`、`workflowTypes.ts` 的类型并构造示例值。
**它必须能通过 `tsc`** —— 等价于「契约类型之间自洽」的编译期检查。任何契约类型的不兼容改动都会让它报错。

### B15 端口与实现者的类型对应

`ports` / `storePort` / `imagePort` / `workspaceRuntimePort` 声明的接口，必须有对应的实现者（`adapters` 层）与消费者（`app` 层）。
这条通过「引用面非空」间接保证：94 处引用即为证据。

### B16 导出的类型引用闭合

`interface.md` 中出现的每个被引用类型名，必须在本包 17 个文件内有定义，或来自 `packages/shared`、`packages/rpc` 等公开依赖。
**不得引用 `studio-runtime` 内部其他目录（`app`/`adapters`/`domain`）的类型** —— 否则契约层会通过类型反向依赖上层。

---

## 五、条目 → 测试对照表

| 条目 | 行为规格                 | 对应测试文件            | 对应断言                                                  |
| :--: | ------------------------ | ----------------------- | --------------------------------------------------------- |
|  B1  | 范围清单                 | `surface.test.mjs`      | 「17 个文件：角色分布与分类计数」                         |
|  B2  | 导出面双向一致           | `surface.test.mjs`      | 「每个模块小节存在，且声明名集合与 AST 导出一致（双向）」 |
|  B3  | 导出总数守恒             | `surface.test.mjs`      | 「164 项导出，运行时 72 / 纯类型 92」                     |
|  B4  | 声明文件的运行时导出受限 | `surface.test.mjs`      | 「6 个纯类型声明文件零运行时导出」                        |
|  B5  | 入口形状                 | `surface.test.mjs`      | 「module 1 项、node 3 项」                                |
|  B6  | 示例不属于公开 API       | `surface.test.mjs`      | 「示例文件的 9 项导出不在兼容入口面清单内」               |
|  B7  | 端口签名不变             | `ports.test.mjs`        | 「4 个端口的导出名与 interface.md 一致」                  |
|  B8  | 端口下沉后的路径         | `ports.test.mjs`        | 「新路径可用；旧路径为 re-export 壳且零逻辑」             |
|  B9  | 端口不含运行期状态       | `ports.test.mjs`        | 「端口文件无模块级 let / 无导出可变对象」                 |
| B10  | 端口引用面守恒           | `ports.test.mjs`        | 「94 处引用，包外 0 次」                                  |
| B11  | 契约层不得反向依赖       | `dependencies.test.mjs` | 「17 个文件不 import app/ adapters/ domain/」             |
| B12  | 下沉消除 adapters→app    | `dependencies.test.mjs` | 「adapters 层到 app 层的 import 数为 0」                  |
| B13  | 层间依赖仍单向           | `dependencies.test.mjs` | 「app→adapters / domain→app / domain→adapters 均为 0」    |
| B14  | 示例可编译               | `typecheck.test.mjs`    | 「tsc 对 contract.example.ts 无错误」                     |
| B15  | 端口与实现者的类型对应   | `ports.test.mjs`        | 「4 个端口引用面均非空」                                  |
| B16  | 导出的类型引用闭合       | `dependencies.test.mjs` | 「interface.md 中的类型名不指向 app/adapters/domain」     |

---

## 六、本包不覆盖的行为

以下行为属于其余 6 个包，本包**不做断言**：

- `app/` 的运行时时序（`services-04`/`05`/`06`）；
- `domain/` 的策略计算（`services-03`）；
- `adapters/` 的进程、数据库、文件系统交互（`services-07`/`08`）。
