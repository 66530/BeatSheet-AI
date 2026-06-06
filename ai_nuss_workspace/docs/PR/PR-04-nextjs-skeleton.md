# PR-04: Next.js 前端骨架 + 缺省安全 UI 渲染契约

## 标题
新增 Next.js 14 App Router 前端骨架：TailwindCSS 暗色主题、空白安全渲染、API 通信客户端。

## 功能描述
- `app/layout.tsx` — 全局布局 + 暗色导演工作台主题（nuss 色板）
- `app/page.tsx` — 首页：拖拽/选择小说文件 + 提交上传
- `app/api_client.ts` — Axios/Fetch 封装：REST 调用 + WebSocket 连接（含指数退避重连）
- `app/globals.css` — TailwindCSS 组件层：`blank-safe-card` / `console-panel` / `console-btn` / `console-btn-primary`
- 空白安全渲染契约：所有组件在 `data` 为空/Partial 时不崩溃，显示占位文案

## 实现思路
- TailwindCSS v3 + 自定义 `nuss` 色板（深色背景 + 紫色强调色）
- `blank-safe-card` 使用 `@layer components` 定义，带 border-dashed 视觉提示
- API 客户端：WebSocket 断线时指数退避重连（max 5 次），重连后自动调用 `/status` 对账
- 所有组件接受 `Partial<T>` 并用默认值补全缺失字段

## 测试方式
```bash
cd ai_nuss_frontend && npm run dev
# 访问 http://localhost:3000
# 确认页面无白屏、按钮可交互
```

## 依赖
PR-01（后端 /health 端点可用）

---
**Status: Submitted** | Branch: `pr/PR-04-nextjs-skeleton`
