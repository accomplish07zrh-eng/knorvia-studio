# apps-cli-packages-01-model 已知差异（known-differences.md）

## 一、对被替换的现行实现：预登记差异 0

本合同冻结的是 `apps/cli/packages/adapters/src/model/**` **现行实现**的可观察行为：旧门在源码与 dist
两种入口上 68/68 全过、0 预登记差异、0 断言放宽（`gate-old.json`）。行为条目中凡与直觉不符处
（如失败事件的 `streamOutputCommitted` 跟随 `replayBoundary` 而非实际提交）都按实测写入
`behavior.md` 并有断言锁定，不作为差异登记。

## 二、桩替换说明

`stubs/` 为 44 个模块路径各生成一个最小桩（`build-stubs.mjs` 从 `interface.md` 签名机械生成），
函数与方法体抛 `Error("not implemented: apps-cli-packages-01-model")`，常量给同类型占位值，
类型/接口声明原样保留。桩替换下契约测试 **0/68 通过**（`stub-gate.json`，`allFail: true`）。纯类型
导出本身没有运行期行为，它们的断言落在所属用例里，随用例整体失败。

## 三、必要重合（逐字保留处，理由与测试）

以下内容与被替换实现逐字一致是**兼容要求**，不是改写残留；每处都有对应断言：

| 重合内容                                                                                                                                  | 理由                                                         | 锁定测试                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 错误消息与占位文案（如 `Unsupported reasoningLevel: <值>`、`[Empty user message]`、`[REDACTED]`、`Model stream cleanup exceeded 1000ms`） | 对外可见字符串（日志、错误、投影文本），改变即改变可观察行为 | tests/model-core.test.ts、tests/stream-compat.test.ts、tests/projection.test.ts |
| 状态事件名（`model_request_started` 等）与事件字段名                                                                                      | 协议/事件面                                                  | tests/runner-core.test.ts、tests/runner-support.test.ts                         |
| 归因与脱敏 header 键（`x-knorvia-*`、敏感头清单）、环境变量键（`KNORVIA_MODEL_*`、`KNORVIA_RUNTIME_ENV`）                                 | 协议字段与环境变量红线（计划书选择 8）                       | tests/runner-core.test.ts、tests/retry-admission.test.ts                        |
| 业务码与配额码表、`retry-after` 系列键名、调试记录 JSONL 字段名                                                                           | 判定输入与持久化格式                                         | tests/errors.test.ts、tests/runner-support.test.ts（B54 金样往返）              |

## 四、与上游 ZCode（固定提交 `zcode-872ad960`）的既有差异（继承事实）

现行 model/ 实现来自历史隔离批次「model adapter v10」，其旧门相对冻结上游实现本就有 9 项预登记差异
（输出通道计数、工具边界、provider body 与业务码、局部重试预算、错误归因、工具流收尾、空结果重试；
见 `docs/knorvia-model-adapter-runtime-acceptance.md`）。本合同以**现行行为**为准，不回退上游行为；
重写阶段同样不得改回上游语义。相似度计分与登记按 M0-2「不过的并入对应替换包」处理（44 个普通模式
未过线文件重写后重新登记 `original`）。

## 五、测试覆盖边界（如实记录）

1. B42 清理超时分支（`Model stream cleanup exceeded 1000ms`）需要 1 秒真实等待，未直接断言；
   清理失败告警路径与被放弃流关闭序列已断言。
2. 网络、真实模型服务、操作系统竞态不在契约测试范围：全部用注入的假 runtime / 假 fetch / 临时目录；
   fixtures 全部为合成数据（无真实用户数据、凭据、内部地址）。
3. 设备标识生成（`ensureCliDeviceMid`）只断言元数据形状（device_id 非空掩码），不锁具体值（跨机不同）。
