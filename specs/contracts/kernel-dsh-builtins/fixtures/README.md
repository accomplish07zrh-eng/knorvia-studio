# kernel-dsh-builtins 夹具

夹具只放**虚构数据与占位值**，不含真实用户数据、凭据或内部服务地址。实现 PR 使用下方夹具时须遵守同样约束。

## 一、`child-environment.json`：工具子进程环境断言的输入

这是**变量名清单与占位值**，实际值是虚构串。测试在启动被测进程前把它们注入测试进程的 `process.env`，并断言子进程里读到同样的值。

| 名字                        | 用途                                              | 断言                                                 |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| `KNORVIA_TEST_PLAIN_MARKER` | 用户普通变量                                      | B9(a)：子进程可见，值等于夹具值                      |
| `MY_SERVICE_API_KEY`        | 用户自己的服务凭据（**不是** DSH 或内建供应商名） | B10(b)：子进程可见，值等于夹具值                     |
| `ANTHROPIC_API_KEY`         | 会在进程级被 `kernel-dsh-00` 清洗的名字           | B12(d)：`process.env` 里已无，子进程有且值等于夹具值 |
| `DSH_KNORVIA_INHERITED`     | 宿主继承的 `DSH_*`                                | B11(c)：子进程不可见                                 |
| `KNORVIA_TEST_AFTER_BOOT`   | boot 之后才注入                                   | B13(e)：子进程不可见                                 |

被断言"不可见"的 DSH 托管名（不由夹具注入，由 `dsh-shell-env` 产生）：`DSH_HOME`、`DSH_SHELL`。

## 二、`runtime-context.json`：运行环境信息的期望字段

| 字段       | 期望                                     |
| ---------- | ---------------------------------------- |
| 主工作目录 | 会话 cwd（测试用临时目录，形状无关）     |
| 平台       | `process.platform`                       |
| shell      | win32 → `pwsh`；其余 → `bash`            |
| OS 版本    | 非空；等于 `os.release()` 或等价宿主读数 |
| 当前日期   | `YYYY-MM-DD`，等于注入时钟的本地日期     |
| 时区       | 非空 IANA 时区名                         |

被断言"不得出现"的品牌串：`powered by DeepSeek Harness`、`You are an AI agent powered by DeepSeek Harness.`、`@deepseek-ai/`、段名 `harness:identity`。

## 三、`mcp-servers.json`：MCP 行生成断言的输入

两个虚构服务器：一个 stdio（`command`/`args`/`env` 占位值），一个 http（`url`/`headers` 占位值），外加一个 `enabled: false` 的服务器（断言不生成行）。

- `env` / `headers` 里的值必须是占位串（如 `placeholder-token`），且**只用于断言映射**，不得进入日志——B22 要求日志只报服务器名与数量。
