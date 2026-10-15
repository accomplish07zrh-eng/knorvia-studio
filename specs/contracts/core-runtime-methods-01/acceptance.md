# core-runtime-methods-01 验收（v1）

## 范围

21 个继承文件（`scope-files.json`：`upstream-modified` 12 / `unreviewed` 6 /
`upstream-unchanged` 3），主题「模型调用与流式事件」，2,945 行；49 个导出（48 运行时值 + 1 纯类型）。
不在范围见 [`README.md`](README.md)。

## 旧门结果

（占位：`gate-old.json` 生成后回填——源码入口 / dist 入口 / 桩替换全失败三跑的用例数与结论。）

## 覆盖项

- 49 个导出逐个被 [`behavior.md`](behavior.md) B1–B31 条目覆盖（见 README 对照表）。
- 事件序列断言五组：流事件消费序（B2）、进入顺序（B7/B16/B20）、完成顺序交错（B19/B22）、
  持久化记录序（B13/B22/B23）、日志序列（B6/B23/B25）——gate 握手断言，无 sleep。
- 金样往返：模型请求/响应投影、流事件 → 用量/账本投影（`fixtures/`，脱敏虚构数据）。
- 语义常量显式入条目：重试预算（B3/B14）、token 限额两级（B4）、token 记账口径（B28/B31）、
  attempt/anchor id 与 `reason` 串（B16）、事件字段序（B16/B21）、usage 观测字段（B28–B30）、
  model-status sink 语义（B6）、sessionType/querySource 元数据（B3/B28）、错误码与超时
  （B15/B17）。

## 未覆盖项（如实登记）

- `methods/index.ts` 桶（不入包）与同目录其余 113 文件（后续分包）。
- 模型适配器网络层、事件存储实现本体（经注入端口测试，端口内实现不在合同面）。
- 计时相关常量（250ms drain 上限、退避延迟值）只断言取值与语义，不做计时行为断言。
