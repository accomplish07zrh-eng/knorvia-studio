# Root runtimeEnv packet：仅公开数据补充

源目标 `packages/desktop/src/main/desktopRuntimeEnv.ts`：SHA256 `74cbdfd11402b8442c1fbd473c8fbd9902c807d05096a9ec736673ab2a55e194`；Git blob `5ecf5a618cfca12b2a69e7e437663de6cb1ba9ed`。本次只提取公开键/字面值与 descriptor member 名称，没有传递目标实现正文或私有拆分。

| 数据 | 精确名称/值 | 目标出处 |
| --- | --- | --- |
| 开发 unsigned helper 逃生变量 | `KNORVIA_CUA_HELPER_ALLOW_UNSIGNED_LOCAL` | 437–438；接受 `1`、`true`、`on`，trim 后 lowercase；release 删除该键的行为仍以原 contract 为准 |
| preview helper install variant | 键 `KNORVIA_CUA_HELPER_INSTALL_VARIANT`；字面值 `preview` | 480 |
| dynamic workflow env 常量 | `KNORVIA_DYNAMIC_WORKFLOW_MODE_ENV` 对应键 `KNORVIA_DYNAMIC_WORKFLOW_MODE` | 402、405、460、466；键值在 shared public declaration 第20行 |
| packaged preview dynamic 字面值 | `alwaysOn` | 405 |
| `KNORVIA_AGENT_RUNTIME` 实际使用的公开成员 | `bundledResourceDir`、`resolveEntrySegments` | 279、283、292、301、308；resolver 的公开平台入参为 process.platform |

Shared public declaration `packages/shared/src/dynamic-workflow-feature.ts` SHA256 `210b8d1bdda0981b85ddf465f91c4c882245d974f68d7910d792e32233d84c42`，Git blob `6bc9252e9f71fb103fb0c7801ee902a5a18c0f9e`。其公开 `DYNAMIC_WORKFLOW_MODES` 第9行列出 `disabled`、`onDemand`、`alwaysOn`。没有从相似变量名推断新增旗标。

仅 E curator 的定向 rg/公开 literal 提取与 digest 读取；root 自述此前额外读取 desktopProfile/remoteCdn 少量正文，需在 root receipt 中按实际接触保留。E 无新 author、无源码改动、无环境配置读取/写入或运行期检查。一次猜测 shared 文件路径不存在、一次 CLI shared 目录不存在，随后 rg 定位公开声明；不算进展或验证通过。
