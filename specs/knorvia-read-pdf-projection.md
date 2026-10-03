# PDF Read 接纳与页面投影

2026-09-30。在保持现有 PDF Read 端口行为的前提下，以纯请求计划与 IO 执行分开组织本地实现。不是替换 PDF/图像第三方工具，不改变 UI、用户文件、模型能力或许可判断；已有来源暴露和过渡许可保留。

## 唯一所有者与时序

FileSystemPort 负责 stat/二进制读取，PdfDocumentPort 负责页数与渲染，ImageProcessorPort 负责模型图像预算。core 只拥有一次请求的计划和输出，没有新缓存、配置、重试或额外 IO。

调用 → 模型图片能力门 → filesystem 配置 → stat → 纯 native/pages 请求计划 → 对应端口执行 → 输出投影。页面执行维持输入顺序启动全部 prepare，等待全部成功后按页码稳定排序；不因新计划改变端口选择时刻与取消边界。

## 冻结契约

- pages 不为 undefined 且 supportsImage 恰为 false 时，在任何配置/stat 前返回原 PDF_PAGES_IMAGES_UNSUPPORTED。缺 filesystem、非普通文件、空文件的错误优先级与消息不变
- stat、getPageCount、readBinaryFile、renderPages、prepareForModel 传递原 signal；一次请求使用同一 trace，仅包含原五字段
- native 使用20MiB输入上限，已配置 PDF port 才调用 getPageCount；超过10页要求 pages；undefined/负数/NaN等既有 port 返回不增加限制。getPageCount普通异常保持身份，cancelled端口错误转换ToolCancelled并保留cause。随后才动态选择 filesystem binary read
- native 只验证前五字节按 Node ASCII 解码是否为 %PDF-，不扩大为文档解析；保留子视图、读取返回 sizeBytes、base64及原错误传播
- pages 使用100MiB上限，再解释1-indexed范围，最多20页，开放尾范围不接受。大小、范围、PDF port、image port按原次序判断；直接 helper 的无效范围继续 PDF_INVALID，不改为外层Read输入验证的其他code
- render 输入传递页范围；全部 prepare 参数保留现有图像预算与同一 trace。输出 MIME 只接受四种既有图像 MIME，否则回退渲染页 MIME；所有尺寸/压缩属性（包括值为undefined的属性存在性）保留
- PDF端口分类错误仅在原page执行catch范围内映射。取消总是转换ToolCancelled；signal已取消的其他错误原样传播；其他原始拒绝不吞掉
- 输出格式、文件名按宿主 basename 的现有行为、描述插入位置、PDF能力严格true、pages超时150000ms以及size格式的边界/NaN/Infinity行为保持不变

## 验证

先以合成端口冻结旧行为，覆盖错误优先级、所有错误类别、动态端口替换、完整请求参数、并行启动/排序、重复页号、子视图、边界与输出格式。再验证新源码、实际emitted构建、差分、Read消费者，以及根/CLI类型、lint、架构和全量回归。模拟端口不能代替真实Poppler/原生图像处理和安装包验收；本次不新增MIT或clean-room结论。
