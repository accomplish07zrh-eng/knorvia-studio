# 浏览器运行时安装入口独立实现

替换 browser-client/index.ts 中的安装逻辑，入口文件保留相同公开导出。安装使用显式传入的 globals、transport、documentationRoot 和 assertAvailable；不读取全局 process、宿主桥接 Symbol 或用户配置，不改变插件宿主的授权边界。

先检查可用性，再为缺失的 agent 建立命名空间。保留已有 agent 对象身份与其他工具字段；只有 browsers 和 documentation 由本安装器更新。安装本身不触发 browser discovery 或 execute。BrowsersFacade 仍提供原运行时视图，文档路由对象冻结。

文档 get 每次重新检查可用性，空名称返回 TypeError。computer-use 名称继续交给安装前的文档提供者，其他名称只查询当前浏览器文档目录。提供者委托须保留原 receiver，避免依赖 this 的 Computer Use 文档实现安装后失效；可重复安装并保留该来源，不把失败当作成功文档。

```text
显式 options → availability guard → 复用/建立 agent
                               → 构造浏览器视图 + 冻结文档路由
                               → 更新该命名空间的两个字段
文档调用 → guard → computer-use 原提供者（原 receiver）/当前浏览器文档
```

验收先在旧入口验证命名空间、未调用 transport、文档冻结、空名称、可用性撤销、重复安装与普通浏览器文档；receiver 委托用例须在旧版复现失败，再验证新实现。所有浏览器测试、根/CLI 类型、lint、架构、格式、构建、离线回归和实际插件产物检查均须运行。核心 SDK 边界完成不代表 MCP 宿主、插件执行后端或全仓替换完成。
