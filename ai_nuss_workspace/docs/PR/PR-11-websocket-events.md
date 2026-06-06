# PR-11: WebSocket 实时事件推送 + 进度条自动更新

## 标题
新增 WebSocket 实时事件系统：JobStore 事件广播 + 前端进度条自动走动 + 断线重连。

## 功能描述
- 后端：`JobStore.add_listener(callback)` → 任何状态变更自动广播到所有 WebSocket 客户端
- 事件类型：`job_created` / `progress_update` / `scene_refining` / `beat_generated` / `pipeline_complete`
- `scene_refining` 事件携带 `{current_scene, total_scenes}` 用于前端显示"场景 X/Y"
- 前端：WebSocket `onmessage` → 实时更新进度条 + 事件日志
- 断线重连：指数退避重试（max 5 次），重连后自动 `GET /status` 对账
- 长时间无响应时前端提示"请刷新查看最新进度"

## 实现思路
- `ws/jobs/{job_id}/stream` 端点接受连接后注册到 `store._listeners`
- processor 的 `_progress()` 每次调用 → `store.update_job()` → `store._notify()` → 所有 WS 客户端
- 前端 `connectJobStream()` 返回 `{send, close, isConnected}`

## 测试方式
```bash
# 打开浏览器 → 提交文件 → 观察进度条实时走动（不依赖刷新）
# 断开网络 → 等待重连 → 进度恢复
```

## 依赖
PR-04（前端骨架）, PR-09（JobStore）
