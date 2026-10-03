# Read 图片与视频的端口投影

2026-09-30。替换图片/视频 Read 的技术实现，保留全部已支持格式、大小限制、图片处理参数、输出字段和错误语义。不改变 UI、文件权限、用户数据、模型能力选择或第三方图像处理实现。PDF 不在本步范围内。

## 所有者与唯一调用路径

FileSystemPort 负责二进制 IO 与输入大小限制，ImageProcessorPort 负责图片解码、尺寸、压缩及模型预算。Read 只进行配置接纳、一次端口读取和结果投影，不增加缓存、转码工具、后备端口或隐藏重试。图片/视频共用二进制读取策略、trace 投影和输入过大错误映射；图片专属处理留在图片分支。

```text
调用 → 验证必需端口 → 唯一 binary read → 图片 prepare / 视频直接投影 → 输出
                                    └→ 明确错误类别映射，其他错误原样向外
```

## 契约

- 两分支缺 FileSystemPort 时保持原 ConfigurationError、消息、toolCallId/toolName 和 recoverable=false；图片再验证 ImageProcessorPort，缺失时禁止 IO
- trace 只包含原来的 traceId/spanId/parentSpanId/sessionId/turnId，signal 原样传递。图片读取和处理使用同一份 trace
- 一次 readBinaryFile 请求包含准确 filePath、对应 READ_IMAGE_MAX_INPUT_BYTES 或 READ_VIDEO_MAX_INPUT_BYTES；不重复读，不自行重新解释 adapter 的 bytesRead/sizeBytes
- 只有真正的 FileSystemPortError 且 code=too_large 才转换为原 recoverable ToolExecutionFailed，保留 cause、消息、对应 input_too_large code、maxBytes 和工具身份；取消、其他端口错误与普通异常原样传播
- 图片 prepareForModel 保留原始二进制视图、输入 MIME、maxBase64Bytes/maxDimension/maxRawBytes/maxTokens/tokenToBase64CharRatio、signal/trace。读取完成后从 context 取得当时的 imageProcessorPort，保持既有调用时序
- 图片输出 base64 来自 prepared.data 的实际视图；originalSize 来自读取结果的 sizeBytes，转换后大小、resized/compressed/strategy 和四个 dimensions 字段逐项保留。processor 输出 MIME 只接受 jpeg/png/gif/webp，否则回退调用方的输入 MIME
- 图片处理阶段只有真正的 ImageProcessorPortError 才转换为原 read*image*<code> 错误及完整预算上下文；其他异常保持原值
- 图片后缀识别继续忽略大小写，只识别 .jpg/.jpeg/.png/.gif/.webp，不因新实现扩大到 query、额外后缀或其他格式
- 视频不压缩、不转码。bytesRead===0 保持原 read_video_input_empty 错误；其他情况按读取视图编码 base64，保留调用方 MIME 和 sizeBytes。视频读取及投影的原错误捕获范围继续保留

## 验收

先在旧实现运行合成端口契约：端口缺失顺序与无 IO、signal/trace、各 MIME、子视图不泄露外围字节、尺寸字段存在性、原始与转换后大小、processor 参数及调用次数、输入过大、全部已知 processor 错误、普通异常身份、视频空输入、动态 processor 选择。再替换并检查源码、实际 emitted JS、真实 Read 路由、根/CLI类型、lint、架构、构建和全量回归。

不把模拟端口测试声称为真实图像解码或原生平台验收。现有图像处理器/Skia 来源义务保留；技术替换不自动新增 MIT 或 clean-room 结论。
