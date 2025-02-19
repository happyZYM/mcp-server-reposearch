[中文](./README.md) | [English](./README_en.md)

这是一个 mcp 服务器，提供比 Cline 内置的 `search_files` 工具更好的内容搜索功能。

功能特性：
- [x] 通过 `.reposearchignore` 文件控制过滤，使用 gitignore 格式
- [x] 支持正则表达式搜索
- 输出格式控制：
  - [x] 是否在结果中包含内容
  - [ ] 包含上下文行
- [ ] 防止 tokens 爆炸

注意事项：
- 目前需要在系统提示中告诉 Cline 停止使用 `search_files`
