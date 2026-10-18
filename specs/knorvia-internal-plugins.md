# Knorvia 内部插件化结构

## 当前决定（2026-10-17）

用户要求把项目改成插件化结构，降低后续维护难度。插件**只供 Knorvia 自己使用**：不开放给用户或第三方编写，不做插件市场，接口可以随产品演进修改，不承担对外兼容。

这里的“插件”指 Knorvia 内部的功能模块。设置里现有的“插件管理”（技能、MCP、`.knorvia-plugin` 内容包）是面向用户的产品功能，范围与界面不变，不是本规格的对象。

插件化不单独安排一轮重写，而是在独立替换计划已经要重写的阶段按新结构写：内核层在 M2（见 `specs/knorvia-builtin-kernel-dsh.md`），服务层在 M3，界面层在 M5。界面样子、交互、数据与协议都不变。

## 目标

- 改一个功能只动它自己的模块；删除一个功能就是从组合清单里去掉它，不留散落各处的引用。
- 每个模块有唯一的状态所有者、明确的公开入口和单向依赖，能被 `pnpm architecture:check` 检查。
- 组合顺序固定、可读，启动时一次组装，运行期不动态加载代码。

## 三层结构

### 内核层（M2）

内置内核由 DSH 运行时加 Knorvia 内核插件组成，插件即 DSH 的 Cordis 插件。

- 每个插件一个包，放在 `apps/cli/packages/kernel-plugins/<名称>`（具体包名在 M2 接入合同中确定），只依赖 DSH 公开 API 与 `@knorvia/contracts`。
- 组合清单由 `bootstrap` 唯一持有，按固定顺序列出 DSH 插件与 Knorvia 插件；隔离要求见内核规格。
- 起始插件：协议桥、凭据、权限策略、Hook、记忆、文件回退、技能来源、补缺工具（按工具分组）、动态工作流、身份与文案。

### 服务层（M3）

在现有依赖注入（`packages/services/src/descriptors.ts`、`collection.ts`、`accessor.ts`）之上增加“功能模块”约定：

```ts
// 示意，最终签名在 M3 合同中确定
interface FeatureModule {
  id: string; // 与 architecture-policy.yaml 的模块 id 一致
  requires: readonly string[]; // 依赖的其他功能模块或基础服务
  register(services: ServiceCollection): void; // 只注册自己拥有的服务
  contributes?: FeatureContributions; // 交给界面层的入口声明（纯数据）
}
```

- 组合根（`packages/services/src/node.ts`、`packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`、`packages/server/src/http.ts`）改为遍历一份固定的功能模块清单完成注册，三处共用同一清单来源，按环境差异通过依赖注入区分。
- 模块之间只通过对方公开入口或共享协议类型交互，禁止深层导入；状态只由所属模块写入。
- 起始功能模块：外部内核（ACP 登记、探测、适配）、内置内核接入、单聊与会话目录、群聊、工作流、自动化、创作、插件管理、记忆、Hook、模型供应商与凭据、远程工作区。拆分边界以 M3 合同实测的依赖关系为准。

### 界面层（M5）

把目前写死的静态表改成由功能模块填充的贡献点（contribution point），渲染结果与现在逐像素一致：

| 贡献点               | 现状                                                                                   | 改后                                                                 |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 窄栏与侧栏入口       | `WorkspaceSidebar.tsx` 等组件内写死                                                    | 功能模块声明入口（id、图标、文案键、顺序、可见条件），侧栏按顺序渲染 |
| 设置分区             | `packages/ui/src/settings/settingsPageConfig.ts`、`lib/settingsNavigation.ts` 静态数组 | 功能模块声明设置分区，导航由声明生成                                 |
| 工具调用卡片         | `ToolCallBlocks/resolveRenderer.ts` 静态映射                                           | 功能模块注册工具名到渲染器的映射，未注册的走通用卡片                 |
| 聊天内功能卡片、命令 | 分散在各组件                                                                           | 按同一方式声明                                                       |

- 贡献点声明是纯数据加组件引用，在应用启动时由固定清单汇总，不在运行期增删。
- 顺序、图标、文案键、可见条件全部显式写出，截图对比（明暗 × 1360/820/390）必须与替换前一致。
- 组件仍通过 `packages/ui/src/hooks/` 访问服务，平台操作仍走 `IPlatformService`。

## 架构治理

- 每个功能模块在 `architecture-policy.yaml` 中登记为受管模块，写明 layers、requires 与 publicEntrypoints；沿用 forbidCycles、forbidDeepImports、文件行数等全局规则。
- 新增或拆分模块时同步更新登记与 `pnpm architecture:context` 可读的上下文。
- 删除功能时，删除其模块、组合清单中的一行与架构登记；不得留下运行期兜底。

## 验收

- 各层改完后，`pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`、全量架构检查、`pnpm test:studio` 全过，Linux 与 Windows CI 全绿。
- 内核层：从组合清单中去掉任一非必需 Knorvia 插件，内核仍能启动，对应能力明确报告不可用（测试覆盖）。
- 服务层：三处组合根注册的功能模块集合来自同一清单；去掉一个功能模块后其余功能测试仍通过。
- 界面层：截图对比与几何回归与替换前一致；侧栏、设置导航、工具卡片的顺序和可见条件有单元测试。
- 架构检查能拦住跨模块深层导入与循环依赖。

## 不做

- 不开放第三方插件 API，不做插件市场，不支持运行期安装或热加载 Knorvia 内部模块。
- 不改用户可见的界面、交互、文案含义、数据格式与协议。
- 不为插件化单独安排一轮重写；只在原计划重写到该区域时按本结构写。
