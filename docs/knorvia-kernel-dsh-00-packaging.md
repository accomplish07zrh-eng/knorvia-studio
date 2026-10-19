# kernel-dsh-00 打包说明

本文件只固化 DSH 运行时的打包布局、模块解析与原生模块解包步骤。安装版、便携版、macOS 与真实模型冒烟归 `kernel-switch` 验收（合同已知差异 D11、D12、D13）。

## 一、锁定版本与依赖

DSH 以 `0.2.0-rc.2` 为版本口径，直接声明在 `apps/cli/packages/bootstrap/package.json`，由 `pnpm-lock.yaml` 锁定：

- `@deepseek-ai/cordis@4.0.5`
- `@deepseek-ai/cordis-plugin-timer@1.1.6`
- 17 个 `@deepseek-ai/dsh-*@0.2.0-rc.2` 子包（组合见 `apps/cli/packages/bootstrap/src/kernel/composition.ts`）

不声明 `@deepseek-ai/dsh` 元包：元包会拉入 `dsh-skill-office` → `@deepseek-ai/libreoffice-kit`（MPL-2.0），而组合不挂载、不打包该可选包。所有 DSH 包的许可已登记在 `third-party/inventory.json` 与 `THIRD-PARTY-NOTICES.md`。

## 二、单文件 bundle 与运行时树

`apps/cli/packages/cli/scripts/build.mjs` 把 `@deepseek-ai/*` 标为 external，默认 bundle 不内联 DSH。Loader 在运行期按包名从磁盘解析插件，因此打包产物必须同时携带 DSH 运行时树：

```
resources/knorvia/
  knorvia.cjs
  node_modules/
    @deepseek-ai/...
    @koromix/...
    koffi/...
```

步骤（由桌面/SEA 打包链实现；本包不修改部署脚本）：

1. `pnpm build:cli-packages` 生成 `apps/cli/packages/cli/dist/knorvia.cjs`。
2. 用 `pnpm deploy --prod --legacy`（或等价的真实目录复制）导出 `@knorvia/cli` 的生产依赖树到 `resources/knorvia/node_modules`。必须是真实目录，不要把仓库内指向 `.pnpm` 的符号链接原样带进 asar。
3. 把 `knorvia.cjs` 放在 `resources/knorvia/`，与 `node_modules` 同级。
4. 不要把 DSH 运行时树打进 asar 后再指望原生模块可加载；原生文件按下节解包。

## 三、bareModuleBaseUrl

`boot(binName, configPath, patches?, prepare?, bareModuleBaseUrl?)` 的最后一个参数是裸包名解析基准。未传时 DSH 从配置文件所在目录向上查找；配置文件位于 `<dataRoot>/dsh/knorvia/kernel.cordis.json`，不在 bundle 内，因此不能依赖默认值。

`apps/cli/packages/bootstrap/src/kernel/module-url.ts` 的 `resolveDefaultModuleBaseUrl()`：

- esbuild CJS bundle：返回 `pathToFileURL(__filename).href`，即 `resources/knorvia/knorvia.cjs`；Node 从该文件向上解析到 `resources/knorvia/node_modules`。
- 源码 / 独立 ESM dist：返回 `import.meta.url`，从 `apps/cli` 工作区解析依赖。

如果打包布局不是“`knorvia.cjs` 与 `node_modules` 同级”，必须通过 `bootKernel({ moduleBaseUrl })` 显式传入 stage 目录内任一文件的 `file:` URL，并保证该文件到 `node_modules` 的相对路径正确。

## 四、原生模块

会话持久化使用两套原生锁，二者都不能内联进单文件：

| 平台        | 包                                                       | 加载路径                                                                 |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Linux glibc | `@deepseek-ai/node-addon-system-linux-x64`               | `bin/glibc/system.node`                                                  |
| Linux musl  | `@deepseek-ai/node-addon-system-linux-x64`               | `bin/musl/system.node`                                                   |
| macOS       | `@deepseek-ai/node-addon-system-darwin-{arm64,x64}`      | `bin/system.node`                                                        |
| Windows     | `koffi@3.1.1` + `@koromix/koffi-win32-{x64,arm64}@3.1.1` | `koffi/src/koffi/index.cjs` 按 `../../../@koromix/koffi-<platform>` 加载 |

`@deepseek-ai/dsh-session-persistence-jsonl` 同时依赖 `koffi` 与 `@deepseek-ai/node-addon-system`；即使当前平台只使用其中一种，两者都要随树保留，因为包的静态依赖会参与加载。

asarUnpack 至少覆盖：

```
**/node_modules/@deepseek-ai/node-addon-system-*/bin/**/*.node
**/node_modules/@koromix/koffi-*/**/*.node
**/node_modules/koffi/**/koffi.node
```

同时保留 `koffi` 与 `@koromix/koffi-*` 的相对目录关系（`node_modules/koffi` 与 `node_modules/@koromix/...` 同级），否则 `koffi/src/koffi/index.cjs` 的 `../../../@koromix/...` 会解析失败。`dsh-session-persistence-jsonl` 的 `lib/worker.cjs` 也随包保留；worker 启动失败会让会话写入失败。

## 五、加载验证

安装版/便携版实机验收（`kernel-switch`）至少执行：

1. 以 `ELECTRON_RUN_AS_NODE=1` 启动包内运行时，加载 `@deepseek-ai/node-addon-system/flock`（Linux/macOS）或 `koffi`（Windows），确认 `.node` 从 `app.asar.unpacked` 加载。
2. 用 `KNORVIA_KERNEL_ENGINE=dsh` 启动 `app-server --stdio`，确认 stderr 只有一行 `knorvia-kernel-ready engine=dsh dsh=0.2.0-rc.2`。
3. 通过公开 `sessions` 服务创建一次会话并写入一条事件，确认 `<数据根>/dsh/sessions` 产生 JSONL；这一步同时验证锁与 worker。
4. 关闭进程，确认退出码为 0 且没有 `kernel.dsh.dispose.timeout`。

以上步骤当前未在安装版/便携版执行；合同 D11、D15 已如实标注归属。
