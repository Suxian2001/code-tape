1. docs/PRD/代码讲解工具.md 文档的权威性是最高的
2. 提交的代码不准背离 docs/技术方案.md 。若认为技术方案有任何错误，应通过 discussion 及时上报仓库维护者
3. 在提交 PR 后等待 action repo-guard 的评论后进行审查
4. 对于前端界面推荐使用 frontend-design 技能
5. 任意 agent 在改代码前必须先运行 `npm run agent:bootstrap`
6. 每次开始任务和提交前必须运行 `npm run contract:local`；该命令会强制刷新 GitNexus 索引
7. 如果改动触碰 schema、runtime、repository、replay、workflow 或权威文档等关键骨架，必须阅读 GitNexus 的 `detect_changes` / `query` / `context` / `impact` 建议，并在 PR 中填写 GitNexus 影响分析摘要
8. 不要安装或要求组员安装 git hooks；本地脚本、agent 指令、PR 模板和 CI 共同构成契约闭环
