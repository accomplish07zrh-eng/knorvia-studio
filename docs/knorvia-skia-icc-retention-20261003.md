# JXL / ICC：固定源码中的保留与重建边界

本次复用已绑定的 libjxl 正文和前次 Skia caller，只新增读取3个明确相关的 Skia 文件，均为 `fe2718df5f53a681087be6f0539045ca1b4b8c09`。3次请求全部HTTP200，长度与Git blob均匹配已有固定 tree。**21项材料义务仍 OPEN，没有许可或分发结论。** [完整来源、行号与限定](../licensing/evidence/skia-icc-retention-20261003.json)。

实际核实的规则：

| 边界                             | 源码结论                                                                                                                                                                                                   | 必要限定                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| libjxl DATA 选择                 | `decode.cc`1902–1906：DATA且XYB时选择 output color encoding，否则选择 metadata color encoding。                                                                                                            | DATA不等于永远选择原始输入ICC。输出 encoding 的完整生成路径未扩展审查。                                        |
| libjxl ICC API                   | `decode.cc`1958–1978：尺寸/状态检查后，完整复制所选 `ICC()` 的 data/size 到调用者buffer。                                                                                                                  | 该API没有逐tag过滤或profile重新序列化；若所选vector包含cprt，它随整体字节复制。不能据此证明所有输入都有该tag。 |
| libjxl重建                       | `color_encoding_internal.cc`418–423/528–563：结构化颜色分支调用CreateICC，清除旧ICC并调用MaybeCreateProfile；后者`color_management.cc`396–401写入既有Google2019/CC-BY-SA3.0 cprt。                         | 这是一条已绑定的生成分支，不能概括为所有DATA输出或所有输入profile的声明。                                      |
| Skia MakeICCProfile成功skcms分支 | [ColorProfile.cpp](https://github.com/google/skia/blob/fe2718df5f53a681087be6f0539045ca1b4b8c09/src/codec/SkCodecColorProfile.cpp#L62)62–69/170–173：解析成功后，将传入整份SkData交给构造器并保存在fData。 | wrapper没有重建ICC、删除cprt或改写buffer的步骤；条件为skcms分支且parse成功。未审查parser内部或执行其代码。     |
| Skia原始数据访问/克隆            | [SkCodecPriv.h](https://github.com/google/skia/blob/fe2718df5f53a681087be6f0539045ca1b4b8c09/src/codec/SkCodecPriv.h#L84)84–86：data()返回fData；ColorProfile.cpp123–126的clone沿用fData。                 | 返回保留的数据对象，不在这些路径重新序列化profile。不是Knorvia实际保存/导出的证据。                            |
| parser选择                       | ColorProfile.cpp77–87：runtime force-skcms优先，否则编译宏`SK_CODEC_COLOR_PROFILE_PARSE_WITH_RUST`选择Rust或skcms。                                                                                        | Rust具体实现不在本次3文件范围；不能把skcms观察提升为所有平台/构建的结果。                                      |

因此，这一步消除了“MakeICCProfile wrapper是否必然重建/剥离原始ICC”的未知：成功skcms路径明确保留传入的完整数据对象及原始data访问口。若cprt位于libjxl选中的ICC vector，已审查复制/wrapper路径没有把它单独排除。此源码条件结论尚未绑定到Knorvia实际native artifact。

第三个关联声明文件 [SkEncodedInfo.h](https://github.com/google/skia/blob/fe2718df5f53a681087be6f0539045ca1b4b8c09/include/private/SkEncodedInfo.h#L129)声明profileData，并提供colorProfile访问口；其`.cpp`中Make/profileData实现未读取。因此不额外断言完整codec/base API的最终byte identity，也不将header里的未来serialize TODO当成当前实现。

未来最终产物需要的最小元数据：

1. **每个OS/arch的分发清单/SBOM与native payload摘要**：Canvas/libjxl是否实际进入ASAR、extraResources或其他交付物；具体`.node` SHA256及关联package/source revision。历史配置排除不能代替实际产物。
2. **该payload的编译/链接来源与有效parser选择**：Skia/libjxl版本、编译define中Rust宏、force-skcms是否被实际设置及相关target/link输入。只有锁文件或源码recipe不足以确定此分支。
3. **若最终功能保存/导出ICC，实际输出/路径元数据**：所用codec/profile accessor还是重序列化路径、输出ICC SHA256与cprt存在/内容及其生成/输入来源。当前未检查Knorvia导出调用方或任何图片。

3个新文件与4份复用公开正文的精确digest已绑定；完整 source implementation 仍在许可审计scratch中，未导入生产或另行复制到仓库。未读取Rust扩展/其他版本或扩展全库，未重试47项429、未请求799项ICU，未接触真实图片/用户数据、backup/私有路径，未运行native/build/tests。保留原Skia BSD、libjxl BSD/PATENTS及生成profile声明；本次0 notice新增、0 MIT授予、0完整义务关闭，停止在这一证据层次。
