# PR-13: Docker 容器化一键部署

## 标题
新增 Docker Compose 多容器编排 + Nginx 反向代理 + 健康检查。

## 功能描述
- `docker-compose.yml`：PostgreSQL 15 + Redis 7 + Qdrant v1.8 + FastAPI 后端 + Next.js 前端 + Nginx
- `backend.Dockerfile` / `frontend.Dockerfile` 多阶段构建
- Nginx 反向代理：API → 后端，WebSocket 升级握手，静态资源 → 前端
- 所有服务含 `healthcheck` 指令
- 环境变量注入 LLM API Keys：`${OPENAI_API_KEY:-}` 缺省为空（自动 stub_mode）

## 实现思路
- PostgreSQL / Redis / Qdrant 使用官方 Alpine 镜像
- 后端 `uvicorn --workers 4` 生产模式启动
- 前端 `next build && next start` 生产模式
- Nginx 配置 WebSocket `Upgrade` + `Connection "upgrade"` 头转发
- named volumes 持久化数据库 + Qdrant 数据

## 测试方式
```bash
docker compose up -d
curl http://localhost/health  # → 200
curl http://localhost/        # → Next.js 首页
```

## 依赖
PR-01 至 PR-12（完整应用）
