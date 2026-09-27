// 官方发布物固定到此版本；只在构建阶段下载，产品运行时不安装或自更新。
export const WINDOWS_CUA_ARTIFACT = Object.freeze({
  version: "0.30.1",
  tag: "cua-driver-rs-v0.30.1",
  commit: "039783f9221a08c0daf9cda65a460fc4f346fa6e",
  url: "https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.30.1/cua-driver-rs-0.30.1-windows-x86_64-binary.zip",
  sha256: "96ebb5996c0e25adf40ed648a46959723d31df5d90f24ffe2fb2d3cc2ee780be",
  files: Object.freeze({
    "cua-driver.exe": "2e6af841d1df1ee3b38820342253c7182782b00affda0683c3c3915073608eb0",
    "cua-driver-uia.exe": "4bfafde43e476922b4a5eb812494cac6dff6a588bcdfbcdfa1084d70d473ad43",
    "cua-cursor-theme.exe": "fd73d2d041eb13ed03c558e84442810c4a5549fbb45c241fda3ffcdc988588d6",
  }),
});
