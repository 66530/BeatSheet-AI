# AI-NUSS 3.0 — PR 提交列表

## 合并顺序（由底向上）

```
PR-14 自动化评测框架 + 金标准数据集
PR-13 Docker 容器化一键部署
PR-12 进度条实时更新 + 上传区灰化 + Beta 提示
PR-11 WebSocket 实时事件推送 + 进度同步
PR-10 Script Quality Score 剧本质量评分
PR-09 GenerationStats + 覆盖率 + Scene Health
PR-08 ScreenplayAgent 节拍+六类元素生成
PR-07 五类分场检测器 + 场景切分引擎
PR-06 Agent 基类 + DeepSeek API 集成
PR-05 Cognitive Kernel 纯函数内核
PR-04 Next.js 前端骨架
PR-03 Pydantic Schema 层
PR-02 数据库 ORM 模型
PR-01 FastAPI 启动骨架 + /health
```

## PR 清单

| PR | 标题 | 类型 | 依赖 |
|----|------|------|------|
| PR-01 | FastAPI 启动骨架 + /health 探针 | 基础设施 | — |
| PR-02 | 数据库 ORM 模型（全表多版本） | 数据层 | PR-01 |
| PR-03 | Pydantic Schema + 三层输出契约 | 契约层 | — |
| PR-04 | Next.js 前端骨架 + 空白安全渲染 | 前端 | PR-01 |
| PR-05 | Cognitive Kernel 纯函数内核 | 核心引擎 | PR-03 |
| PR-06 | Agent 基类 + DeepSeek API 集成 | Agent | PR-03, PR-05 |
| PR-07 | 五类分场检测器 + 场景切分引擎 | 场景 | PR-05, PR-06 |
| PR-08 | ScreenplayAgent 节拍+六类元素 | 剧本 | PR-06, PR-07 |
| PR-09 | GenerationStats + 覆盖率 + Health | 质量 | PR-08 |
| PR-10 | Script Quality Score 五维评分 | 质量 | PR-07 |
| PR-11 | WebSocket 实时事件 + 进度同步 | 通信 | PR-04, PR-09 |
| PR-12 | 进度条自动更新 + 灰化 + Beta | 前端UX | PR-11 |
| PR-13 | Docker 容器化一键部署 | 部署 | PR-01~12 |
| PR-14 | 自动化评测框架 + 金标准数据 | 评测 | PR-05~10 |

## PR 粒度原则

- 每个 PR 只做一件事
- 合并后 `main` 分支始终可运行
- 大功能拆分：场景切分 = PR-07（引擎） + PR-10（评分）
- 剧本生成 = PR-08（元素） + PR-09（统计）
