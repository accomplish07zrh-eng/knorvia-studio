# apps-cli-01 接口（interface.md）

本文件只列兼容所需的**模块路径、导出名、参数、返回类型与命令行接口**。三个脚本都没有 TypeScript 类型声明，签名按旧实现的可调用方式记录；替换实现必须保留同样的导出名与可观察形状。

## 一、模块路径

| 路径                                                  | 形态                          | 导出 |
| ----------------------------------------------------- | ----------------------------- | ---- |
| `apps/cli/scripts/clean-dist.mjs`                     | ESM，导入即执行的脚本         | 无   |
| `apps/cli/scripts/count-ts-lines.mjs`                 | ESM，导入无副作用 + CLI       | 6 个 |
| `apps/cli/scripts/generate-bash-command-registry.mjs` | ESM，导入即执行（顶层 await） | 无   |

没有 `dist` 构建产物。源码入口直接 `import` 上述路径；进程入口用 `node <path>` 执行。

## 二、`count-ts-lines.mjs` 的导出

```js
/**
 * @param {string} filePath
 * @returns {boolean}
 */
export const isTestSourceFile = (filePath) => {};

/**
 * @param {string} source
 * @returns {number}
 */
export const countLines = (source) => {};

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export const isCountedSourceFile = (filePath) => {};

/**
 * @param {string} rootDirectory
 * @returns {Promise<Array<{ absolutePath: string, relativePath: string }>>}
 */
export const collectTypeScriptFiles = async (rootDirectory) => {};

/**
 * @param {string} rootDirectory
 * @returns {Promise<Array<{
 *   absolutePath: string,
 *   relativePath: string,
 *   bytes: number,
 *   lines: number
 * }>>}
 */
export const measureTypeScriptFiles = async (rootDirectory) => {};

/**
 * @param {Array<{ relativePath: string, lines: number, bytes: number }>} measurements
 * @returns {string}
 */
export const formatReport = (measurements) => {};
```

- `collectTypeScriptFiles` 的 `relativePath` 统一使用 `/`；`absolutePath` 为平台原生路径。
- `formatReport` 只读取 `relativePath`、`lines`、`bytes` 三个字段；返回的字符串以 `\n` 结尾。
- 模块被导入时**不执行扫描**；只有 `process.argv[1]` 解析后等于脚本路径时才运行 CLI。

## 三、命令行接口

### `clean-dist.mjs`

```text
node apps/cli/scripts/clean-dist.mjs
```

- 参数：全部忽略。
- 作用：删除 `resolve(process.cwd(), "dist")`。
- stdout/stderr：成功时为空。

### `count-ts-lines.mjs`

```text
node apps/cli/scripts/count-ts-lines.mjs [root] [ignored...]
```

- `root`：扫描根；缺省为 `process.cwd()`；其余参数忽略。
- 成功：报告写 stdout，退出码 0。
- 失败：stderr `lint:count failed: <message>\n`，退出码 1，stdout 为空。

### `generate-bash-command-registry.mjs`

```text
node apps/cli/scripts/generate-bash-command-registry.mjs [--check] [--output <path>]
```

- `--check`：不写仓库文件，只在内存生成并与默认输出逐字节比较；可出现在任意位置。
- `--output <path>`：写到指定路径；相对路径按 cwd 解析；父目录不存在时创建。
- 同时给出 `--check` 与 `--output` 时，`--check` 生效，`--output` 的值被忽略。
- 未知参数被忽略。
- 默认输出（无 `--output` 且非 `--check`）：`apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts`，相对**脚本所在目录**解析。
- 成功：stdout 一行 JSON 摘要；退出码 0。

摘要的字段与顺序：

```json
{
  "bytes": 1906984,
  "figVersion": "2.692.3",
  "hash": "1b0d34b4f4fadc4dafab139702e8687830396154c01f23c5a7d523cecd8dad03",
  "roots": 707,
  "skipped": {
    "dynamicSubcommands": 0,
    "imports": 0,
    "invalidNodes": 0,
    "loadSpecNodes": 522
  }
}
```

（实际输出为单行；上下限与固定版本见 `behavior.md` B15、B18。）

## 四、生成文件的兼容面

生成器输出的 `bash-command-registry.ts` 由 `core-tool-handlers-01` 消费，本包只固定其**模板与字节**。导出集合必须保持：

```ts
export type BashCommandRegistryOption = readonly [readonly string[], 0 | 1];
export type BashCommandRegistryNode = readonly [
  readonly string[],
  readonly BashCommandRegistryOption[],
  number,
  readonly BashCommandRegistryNode[],
];
export const BASH_COMMAND_REGISTRY_VERSION: string;
export const BASH_COMMAND_REGISTRY_HASH: string;
export const BASH_COMMAND_REGISTRY: Readonly<Record<string, BashCommandRegistryNode>>;
```

- `BASH_COMMAND_REGISTRY_VERSION` 必须是 `fig-<FIG_VERSION>`。
- `BASH_COMMAND_REGISTRY_HASH` 必须是构建内容的 sha256（口径见 `behavior.md` B18）。
- 文件头四行与类型行逐字固定（`behavior.md` B18）。

## 五、入口切换

| 入口     | 环境变量                      | 说明                                 |
| -------- | ----------------------------- | ------------------------------------ |
| 源码入口 | `KNORVIA_CLI01_ENTRY=source`  | 测试进程内导入并调用                 |
| 进程入口 | `KNORVIA_CLI01_ENTRY=process` | 子进程执行脚本文件（等价于 dist 槽） |

测试辅助代码在 `tests/entry.mjs`；替换实现不得依赖这个环境变量，它只影响测试如何加载脚本。
