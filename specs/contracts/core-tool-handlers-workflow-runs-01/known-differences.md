# core-tool-handlers-workflow-runs-01 已知差异（known-differences.md）

版本 v1。替换实现与被替换的继承实现之间的**已登记差异**。合同阶段预登记差异：**0**——契约测试（60 例）与金样往返（`fixtures/workflow-runs-goldens.json`，旧实现录制真值）要求逐字节一致，行为差异一律视为缺陷。以下登记两类**非缺陷**事项：

## K-x-1 必要重合（协议面逐字保持）

下列文本/形状是对外协议面（模型可读文案、错误判别键、失败码表、块标签、属性名），替换实现必须逐字保持，相似度门对此类行的重合不作为「照搬」证据：

- 六个工具的 `metadata.description` 引导文案（模型下一步的唯一依据）
- 失败 message 判别键前缀（`workflow_resume_unavailable:`、`workflow_run_*:`、`workflow_question_answering_unavailable:`、`run_not_found`）与失败码表（11–17、21–24）
- 模型面块标签与属性名（`<summary>`/`<run_id>`/`<label source=…>`/`<status>`/`<usage>…`/`<error code=…>`/`<artifacts count=…>`、`<health>`/`<phases>`/`<subagents>`/`<log_tail>` 的行格式）
- 定型文案（"No workflow runs recorded for this project."、"No workflows are saved in this project yet. …"、"No subagents created yet."、"No log() narration recorded yet."、"GetWorkflowRun returned an invalid result." 等兜底句）
- 摘要/活动行的措辞（"was in flight at the stop"、"waiting for a slot"、"backoff"、"retry in"、"for 1m 00s" 等相对年龄与单复数词形）

## K-x-2 测试对合成数据的形状约束（非行为差异）

- 测试合成的 `DynamicWorkflowRunDetail` 必须含 `actors`/`logTail` 数组与 artifact 的 `versions`/`id`/`version`/`itemCount` 字段（输出 schema 与投影器的必填面）；录制金样所用快照即按此形状构造。
- Windows 文件名不能含引号/尖括号（平台差异）：转义用例把特殊字符放进**内容**，文件名只用 `&`。

## 未登记差异

无。若替换阶段发现无法等价的实现细节，先补登记此文件与对应用例，再动实现。
