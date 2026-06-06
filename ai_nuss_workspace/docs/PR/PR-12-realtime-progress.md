# PR-12: 进度条实时更新 + 任务处理中上传区灰化 + Beta 开发提示

## 标题
进度条根据 WebSocket 事件自动走动 + 处理中禁止上传 + 左侧开发测试阶段提示。

## 功能描述
- **进度条自动更新**：WebSocket `progress_update` 事件 → `progressPct` 实时变化 → 进度条 CSS `width` 动画过渡
- **长时间无响应提示**：进度超过 30s 未变化 → 显示"长时间未响应？请刷新查看最新进度或重试"
- **处理中上传区灰化**：任务处理中（uploading/analyzing/generating）→ 上传按钮 `pointer-events-none opacity-50` + 提示"处理中，请等待"
- **左侧 Beta 提示**：布局左侧固定显示"开发测试中 · 消耗开发者 API 额度"

## 实现思路
- 进度条 `transition-all duration-700` + `style={{width: progressPct + '%'}}`
- 30s 无变定时器 `setTimeout` → 显示提示条
- `isProcessing` 状态 → 上传区 `disabled` + 视觉灰化 + tooltip 文字
- layout.tsx 左侧 `aside` 固定列

## 测试方式
```bash
# 提交文件 → 观察进度条自动走动
# 处理中点击上传区 → 无响应 + 灰色显示
# 左侧显示 Beta 提示文字
```

## 依赖
PR-11（WebSocket Events）
