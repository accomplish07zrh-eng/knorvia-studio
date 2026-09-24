import "./desktopEarlyDataBaseDirBootstrap.js";

// 必须保留动态导入边界。打包器会将静态 services 依赖提升到公共 chunk，
// 若与主窗口一并静态加载，paths/logger 可能先于便携目录选择读取系统 profile。
await import("./index.js");
