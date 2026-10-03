# Skia JPEG XL：一项调用方来源未知已核实

本次只核实旧记录明确缺失的 `src/codec/SkJpegxlCodec.cpp` 正文及其 ICC 接入路径。**1 次公开 publisher 请求、HTTP200；0 项完整材料义务关闭，21 项仍 OPEN。** 没有重试47项HTTP429、请求799项ICU、访问私有材料、执行上游代码或修改全局许可/清单。

固定版本为 Skia `fe2718df5f53a681087be6f0539045ca1b4b8c09`，沿用已验证的 canvas0.1.100 `gitHead` → Skia gitlink 来源链。原 [integration partition](../licensing/evidence/skia-integration-partition-20261002.json) 的 `jpegXL.buildSelection.integrationCallerBodyUnavailable` 已记载预期 blob 与长度；新正文精确匹配：

- 18,079 bytes，Git blob `5e2c9f12b0c3c366a2e94493bca83f27b5ae2fde`。
- SHA256 `7f4c7e002cf2546d9fdaf266115e1c40b7265a169bb481c79e7548c0431628a1`。
- [固定 publisher 文件](https://github.com/google/skia/blob/fe2718df5f53a681087be6f0539045ca1b4b8c09/src/codec/SkJpegxlCodec.cpp#L165)；完整请求/摘要/范围记录见 [新证据](../licensing/evidence/skia-jpegxl-caller-20261003.json)。

实际减少的未知是：旧证据只知道该 caller 被 build manifest 选择，无法确认 libjxl 返回的 ICC 到 Skia 的边界；现在可在该固定文件中观察以下路径。

| 来源行 | 观察 |
| --- | --- |
| 80–87、107–111、160–163 | codec 将 encodedInfo 传给基类；MakeFromStream 订阅并等待 libjxl color-encoding metadata。 |
| 165–175 | 调用 JxlDecoderGetICCProfileSize，目标为 JXL_COLOR_PROFILE_TARGET_DATA；查询失败令尺寸归零，零尺寸不建立 profile。非零尺寸分配 SkData buffer。 |
| 177–187 | 同一 DATA 目标的 JxlDecoderGetColorAsICCProfile 写入该 buffer；失败返回空 codec；成功将 buffer 交给 SkCodecs::ColorProfile::MakeICCProfile。 |
| 191–197 | 将所得 profile 传入 SkEncodedInfo，再传给新建 codec。此 caller 没有另行要求 profile 构造成功。 |
| 265、333–335 | 像素输出路径查询 colorXform；需要时调用既有 applyColorXform。这是源码调用事实，没有执行解码或色彩转换。 |

这建立了固定源码中的 ICC **消费/codec 接入路径**。它不证明 profile 构造器保留原始 `cprt` 内容，也不证明 DATA 目标在每个输入上返回带有旧记录Google2019/CC-BY-SA3.0声明的生成 profile。完整 caller 中没有独立 ICC 文件写出调用；这也不能排除下游接口、base/profile 对象或 Knorvia 其他代码保存/导出它。

原始 caller 标明 Google2021版权并引用 Skia BSD-style LICENSE；既有完整 Skia BSD notice、libjxl BSD LICENSE/PATENTS 与已记录 ICC 输出声明均须保留，未改写成 MIT。没有新增许可选择、授权推断或全局 notice 更新。

剩余最小证据缺口：同版本 ColorProfile::MakeICCProfile/后续访问路径对原始 ICC/cprt 的保留规则；具体发布 native artifact 的构建/链接材料；若涉及 ICC 分发，具体 Knorvia 保存/导出路径或实际发布 artifact。旧 packaging exclusion 继续保持其原历史版本/配置限定，不因此退休源码/历史义务。

本次停在这一项。旧冻结 partition/source-pass 保持原样，由新记录补充其当时的 missing-caller 事实。所有检查只涉及已下载公开字节、source行与元数据；普通测试/构建、source emit、应用/用户数据操作、跨路合并均未运行。
