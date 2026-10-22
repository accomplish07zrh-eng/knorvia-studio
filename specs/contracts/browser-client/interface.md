# browser-client 接口合同（v1）

**用途**：`@knorvia/browser-client` 的导出面与公开签名。
它既是「盲写」的依据（只读本文件 + 依赖类型，不读旧实现），
也是「相似度检查」时判定「哪些行属于契约面」的依据。

**来源**：`apps/cli/packages/browser-client/src/` 的 31 个文件。
本文件**只列导出名与公开签名**，不描述实现。

---

## 一、入口与聚合

### `index.ts`（包入口，`@knorvia/browser-client`）

```ts
export { BrowsersFacade } from "./facade.js";
export { Browser } from "./facade.js";
export { BrowserTabs } from "./facade.js";
export { BrowserRecordingAPI } from "./facade.js";
export { RawTab } from "./facade.js";
export { Tab } from "./facade.js";
export type {
  BrowserTabInfo,
  BrowserBackendType,
  BrowserAvailabilityGuard,
  BrowserCapabilityInfo,
  BrowserClientTransport,
  BrowserExecuteFn,
  BrowserTransportExecuteFn,
  BrowserInfo,
  BrowserDescriptor,
} from "./facade.js";
export { BrowserCommandError } from "./result.js";
export {
  PlaywrightAPI,
  PlaywrightDownload,
  PlaywrightFileChooser,
  PlaywrightFrameLocator,
  PlaywrightLocator,
} from "./playwright.js";
export type {
  ElementInfo,
  KeyboardModifier,
  LoadState,
  TextMatcher,
  WaitUntil,
} from "./playwright.js";
export { selectBrowserForUrl, selectDefaultBrowser } from "./selection.js";
export { BrowserApiPolicy, createBrowserApiProxy, loadBrowserApiManifest } from "./manifest.js";
export type { BrowserApiManifest, BrowserApiManifestMember } from "./manifest.js";
export { setupBrowserRuntime } from "./runtime-installation.js";
```

### `facade.ts`（聚合 barrel，被 `index.ts` 使用）

```ts
export { RawTab } from "./raw-tab.js";
export { Tab } from "./tab.js";
export { AlertDialog, BeforeUnloadDialog, ConfirmDialog, PromptDialog } from "./browser-dialogs.js";
export { BrowserCapabilityCollection } from "./browser-capabilities.js";
export { BrowserRecordingAPI } from "./browser-recording.js";
export { BrowserTabs, BrowserUser } from "./browser-tabs.js";
export { Browser } from "./browser-connection.js";
export { BrowsersFacade } from "./browser-registry.js";
export type {
  BrowserExecuteFn,
  BrowserAvailabilityGuard,
  BrowserTransportExecuteFn,
  BrowserBackendType,
  BrowserCapabilityInfo,
  BrowserInfo,
  BrowserDescriptor,
  BrowserTabInfo,
  BrowserClientTransport,
  BrowserHistoryOptions,
  BrowserHistoryEntry,
  Point,
} from "./facade-contract.js";
```

### `playwright.ts`（聚合 barrel）

```ts
export { PlaywrightLocator } from "./playwright-locator.js";
export { PlaywrightFrameLocator } from "./playwright-frame.js";
export { PlaywrightDownload, PlaywrightFileChooser } from "./playwright-handles.js";
export {
  PlaywrightAPI,
  createPlaywrightAPI,
  configurePlaywrightObjectWrapper,
} from "./playwright-page.js";
export type {
  TextMatcher,
  LoadState,
  WaitUntil,
  WaitForState,
  KeyboardModifier,
  ElementInfo,
  SelectOptionInput,
} from "./playwright-contract.js";
```

---

## 二、9 个「可投入」文件（下界 < 0.18）

### `api-catalog.ts`（下界 0.019）

```ts
export function createBrowserApiCatalog(): BrowserApiManifest;
```

### `tab-cua.ts`（下界 0.044）

```ts
export function createCua(act: Act): CuaTab;
export function createDomCua(act: Act, snapshot: () => Promise<BrowserSnapshot>): DomCuaTab;
```

**行为要点**（测试已锁定）：

- `createCua.click` 走 `x` / `y` **坐标**
- `createDomCua.click` 走 `ref: node_id` **DOM 引用**
- 鼠标按钮 `1 → "left"`、`2 → "middle"`、`3 → "right"`；省略时 `"left"`；其他值抛错
- `keypress` 选项里的修饰键**只保留已知的 5 个**（`Alt` / `Control` / `ControlOrMeta` / `Meta` / `Shift`）；
  全被过滤掉时 `modifiers` 为 `undefined`（不产出空数组）
- `move` 发成 `hover` 命令；`double_click` 带 `doubleClick: true`

### `playwright-runtime.ts`（下界 0.063）

```ts
export function publicObject<T extends object>(value: T, name: string, wrapper?: ObjectWrapper): T;
export function sendAction(
  run: Run,
  action: BrowserPlaywrightAction,
): Promise<BrowserCommandResult>;
export function readAction<T>(run: Run, action: BrowserPlaywrightAction): Promise<T>;
export function withActionContext<T>(fn: () => Promise<T>, context: string): Promise<T>;
export function evaluateExpression(expression: string, args: unknown[]): unknown;
export const locatorIdentity: unique symbol;
export const installObjectWrapper: (wrap: ObjectWrapper) => void;
export const identityWrapper: ObjectWrapper;
```

### `documentation-render.ts`（下界 0.085）

```ts
export const BROWSER_FALLBACK_GUIDE: string;
export function renderBrowserDocumentation(
  api: BrowserApiManifest,
  title: string,
  contents: readonly string[],
  descriptor?: BrowserBackendDescriptor,
): string;
```

**行为要点**（测试已锁定）：

- 输出必含 `# <title>`；标题里的换行被压成单个空格
- 给了 `descriptor` 时先输出 `# Browser context` 块（`- Name:` / `- Type:` / `- ID:` 三行 + 一句提示）
- 没给 `descriptor` 时不输出该块
- `contents` 的每个 block 按传入顺序保留

### `browser-objects.ts`（下界 0.095）

```ts
export function policyObject<T extends object>(
  value: T,
  name: string,
  policy: BrowserApiPolicy,
  hideUnknown?: boolean,
): T;
export function unavailable(message: string): BrowserCommandError;
```

**行为要点**（测试已锁定）：

- `policyObject` 返回的是**新对象**（`!== value`），且方法被绑定到原实例（取出后单独调用仍作用于原实例）
- 普通属性与嵌套对象原样读出
- `unavailable` 返回 `BrowserCommandError`，`code` 恒为 `"backend_unavailable"`，`message` 逐字保留

### `api-policy.ts`（下界 0.117）

```ts
export class BrowserApiPolicy {
  constructor(manifest: BrowserApiManifest, descriptor: BrowserBackendDescriptor);
  updateDescriptor(descriptor: BrowserBackendDescriptor): void;
}
export function createBrowserApiProxy<T extends object>(
  target: T,
  objectName: string,
  policy: BrowserApiPolicy,
  options?: { hideUnknown?: boolean },
): T;
```

### `selection.ts`（下界 0.131）

```ts
export function selectDefaultBrowser(infos: readonly BrowserInfo[]): BrowserInfo | undefined;
export function selectBrowserForUrl(
  infos: readonly BrowserInfo[],
  url: string,
  tabs: ReadonlyMap<string, readonly string[]>,
): BrowserInfo;
export function selectTabForUrl<T extends { url?: string; active?: boolean }>(
  targetValue: string,
  tabs: readonly T[],
): T | undefined;
```

### `browser-registry.ts`（下界 0.155，已重写到 0.206）

```ts
export class BrowsersFacade {
  constructor(
    transport: BrowserClientTransport,
    options?: { documentationRoot?: string; assertAvailable?: BrowserAvailabilityGuard },
  );
  asRuntimeObject(): BrowsersFacade;
  list(): Promise<BrowserDescriptor[]>;
  get(idOrType: string): Promise<Browser>;
  getDefault(): Promise<Browser>;
  getForUrl(url: string): Promise<Browser>;
  open(url?: string, options?: { reuseTab?: boolean }): Promise<Tab>;
  current(): Promise<Tab>;
  listTabs(): Promise<Tab[]>;
  tab(tabId: string): Tab;
  documentation(name?: string): string;
}
```

### `documentation.ts`（下界 0.180）

```ts
export function loadBrowserDocumentation(
  documentationRoot?: string,
  name?: string,
  descriptor?: BrowserBackendDescriptor,
): string;
```

---

## 三、其余文件（测试覆盖到的，列出导出面供盲写参考）

| 文件                      | 导出                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `browser-capabilities.ts` | `class BrowserCapabilityCollection`                                                                                     |
| `browser-commands.ts`     | `const commands`（一组命令构造器）                                                                                      |
| `browser-connection.ts`   | `class Browser`                                                                                                         |
| `browser-dialogs.ts`      | `class AlertDialog` / `BeforeUnloadDialog` / `ConfirmDialog` / `PromptDialog`；`function createDialog`；`type JsDialog` |
| `browser-recording.ts`    | `class BrowserRecordingAPI`                                                                                             |
| `browser-tabs.ts`         | `class BrowserTabs` / `class BrowserUser`                                                                               |
| `playwright-frame.ts`     | `class PlaywrightFrameLocator`                                                                                          |
| `playwright-handles.ts`   | `class PlaywrightDownload` / `class PlaywrightFileChooser`                                                              |
| `playwright-locator.ts`   | `class PlaywrightLocator`                                                                                               |
| `playwright-page.ts`      | `class PlaywrightAPI`；`function createPlaywrightAPI`；`function configurePlaywrightObjectWrapper`                      |
| `playwright-selectors.ts` | `function matchText` / `query` / `roleQuery` / `testIdQuery` / `requireSelector`；`const appendSelector` / `frameScope` |
| `raw-tab.ts`              | `class RawTab`                                                                                                          |
| `result.ts`               | `class BrowserCommandError`；`function base64ToBytes` / `expectOk` / `expectPayload`                                    |
| `runtime-installation.ts` | `function setupBrowserRuntime`；`interface BrowserRuntimeOptions`                                                       |
| `tab.ts`                  | `class Tab`                                                                                                             |
| `manifest.ts`             | `function loadBrowserApiManifest`；re-export `BrowserApiPolicy` / `createBrowserApiProxy` / 4 个类型                    |
| `facade-contract.ts`      | 14 个类型别名/接口（执行函数、守卫、传输、信息、描述、Tab 信息、历史、Point、CuaTab、DomCuaTab）                        |
| `api-contract.ts`         | `type BrowserApiMemberKind`；5 个 interface（需求、声明、清单成员、清单对象、清单）                                     |
| `playwright-contract.ts`  | 7 个类型 + 5 个 interface（Locator 选项等）                                                                             |

---

## 四、盲写规则

**做**：

1. 只读本文件 + `@knorvia/contracts/browser-control` 的类型 + `browser-client/test/` 的测试
2. **禁止读 `core/src/browser-client/` 或 `apps/cli/packages/browser-client/src/` 的旧实现**
3. 写到 `browser-client/test/` 的测试全过
4. 测 normal 口径相似度（基线 `beff12b5` 的来源文件）

**验收**：

- `pnpm --dir apps/cli/packages/browser-client test` 全绿
- `pnpm --dir apps/cli/packages/browser-client typecheck` 通过
- 相似度 containment < 0.20

**⚠️ 关于下界**：本文件第二节列了每个文件的下界。
若下界 > 0.20，**盲写也不可能达标**（契约行必然命中）→ 不必投入。
