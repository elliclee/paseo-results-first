# 开发约定

- 面向 Paseo 0.11.4 的独立额度快照插件；仅加载 client/quota，保持所有原生展示。
- 文档默认中文，提交信息采用英文 Conventional Commits；提交使用实际维护者身份。
- 修改前检查仓库、分支和已有改动。按影响运行定向测试；额度及入口用 `npm test -- test/unit/quota.test.ts test/unit/quota-only-entry.test.ts`。不要重新注册历史外观功能。
- 客户端发布前运行类型检查与 `npm run check:hermes`。安装命令变化时在隔离的 Paseo home 验证，不改用户运行中的 daemon。
- 保留 LICENSE 和 docs/third-party 中的版权说明。不要提交账号凭据、聊天记录、本机路径或个人截图。
