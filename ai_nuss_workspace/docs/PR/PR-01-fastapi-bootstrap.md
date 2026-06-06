# PR-01: FastAPI 启动骨架 + 健康检查探针

## 标题
新增 FastAPI 异步启动骨架、全局异常中间件、`GET /health` 健康检查探针及 CORS 配置。

## 功能描述
- 创建 `app/main.py` — FastAPI 异步入口，含 lifespan 生命周期管理
- `GET /health` 硬编码返回 `{"status": "healthy"}` HTTP 200，无数据库依赖、无需鉴权
- `POST /api/v1/jobs/submit` Mock 端点，无 API Key 时返回合法 UUID 任务描述符
- 全局异常中间件：任何未捕获异常返回结构化 `{"error_code": ..., "message": ...}`
- CORS 允许 Next.js 开发服务器跨域访问

## 实现思路
- FastAPI + uvicorn 异步启动，`@asynccontextmanager` 管理 lifespan
- `/health` 探针按规格书要求：硬编码秒回，不检查任何外部依赖
- `POST /api/v1/jobs/submit` 内联 mock 逻辑：生成 `uuid4` job_id，返回 `{"job_id": "xxx", "status": "processing"}`
- 全局中间件通过 `@app.middleware("http")` 注册，捕获整个请求链的异常

## 测试方式
```bash
cd ai_nuss_backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
# 预期 1.5s 内冷启动成功

curl http://localhost:8000/health
# 预期: {"status": "healthy", "app": "AI-NUSS 3.0", ...}

curl -X POST http://localhost:8000/api/v1/jobs/submit \
  -H "Content-Type: application/json" \
  -d '{"file_text":"测试","file_type":"txt"}'
# 预期: {"job_id": "job_xxx", "status": "processing"}
```

## 依赖
无前序 PR。本 PR 为项目起点。
