// TypeORM 的 PlatformTools 用 require 惰性加载可选数据库驱动。
// 打包器无法解析这些未安装的包，会把 require 改写成模块顶层的 throw，
// 导致加载 typeorm 的进程（UI 主进程、DB worker）启动即崩溃。
// 本项目只使用 better-sqlite3，其余可选驱动统一映射到这个空模块。
export default {}
